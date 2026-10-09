//! Local-only GPL component. Public Hypha calculation code, not private Kirin OS code.
//! Input PCM stays inside the calling Worker. Statistics do not score audio quality.
#[allow(dead_code)]
#[path = "../vendor/phase_d/mod.rs"]
mod phase_d;
#[allow(dead_code)]
#[path = "../vendor/resampler.rs"]
mod resampler;
use phase_d::stream::PhaseDStream;
use phase_d::tables::FieldType;
use resampler::ResamplerTo48k;
use std::cell::RefCell;

const CAPACITY: usize = 38_400;
const WIDTH: usize = 42; // N, S, 20 specific-loudness groups, 20 persisted PSB groups.
struct State {
    input: Vec<f64>,
    channels: usize,
    streams: Vec<PhaseDStream>,
    resampler: Option<ResamplerTo48k>,
    pending: Vec<f64>,
    sums: [f64; WIDTH],
    last: [f64; WIDTH],
    frames: u64,
    finished: bool,
}
thread_local! { static STATE: RefCell<Option<State>> = const { RefCell::new(None) }; }

#[no_mangle]
pub extern "C" fn core_version() -> u32 { 1 }
#[no_mangle]
pub extern "C" fn core_init(rate: u32, channels: u32) -> i32 {
    core_drop();
    if !(8_000..=192_000).contains(&rate) || !(1..=2).contains(&channels) { return -1; }
    let resampler = if rate == 48_000 { None } else {
        match ResamplerTo48k::new(rate, channels as usize) { Ok(r) => Some(r), Err(_) => return -2 }
    };
    STATE.with(|s| *s.borrow_mut() = Some(State {
        input: vec![0.0; CAPACITY], channels: channels as usize,
        streams: (0..channels).map(|_| PhaseDStream::new(FieldType::Free)).collect(),
        resampler, pending: Vec::new(), sums: [0.0; WIDTH], last: [f64::NAN; WIDTH], frames: 0, finished: false,
    })); 0
}
#[no_mangle]
pub extern "C" fn core_input_ptr() -> *mut f64 {
    STATE.with(|s| s.borrow_mut().as_mut().map_or(std::ptr::null_mut(), |s| s.input.as_mut_ptr()))
}
#[no_mangle]
pub extern "C" fn core_input_capacity() -> u32 { CAPACITY as u32 }

impl State {
    fn consume(&mut self, finish: bool) {
        let slot = 4_800 * self.channels;
        while self.pending.len() >= slot || (finish && !self.pending.is_empty()) {
            let count = self.pending.len().min(slot);
            let mut outputs = Vec::new();
            for channel in 0..self.channels {
                let mono: Vec<f64> = self.pending[..count].chunks_exact(self.channels).map(|frame| frame[channel]).collect();
                outputs.push(self.streams[channel].push(&mono));
            }
            // Channel signals are never summed before the nonlinear hearing model.
            for index in 0..outputs[0].len() {
                let mut combined = [0.0; WIDTH];
                for output in &outputs {
                    let r = &output[index];
                    combined[0] += r.loudness / self.channels as f64;
                    combined[1] += r.sharpness / self.channels as f64;
                    for band in 0..20 {
                        combined[2 + band] += r.n_prime[band] / self.channels as f64;
                        combined[22 + band] += r.psb[band] / self.channels as f64;
                    }
                }
                self.last = combined;
                for (sum, value) in self.sums.iter_mut().zip(combined) { *sum += value; }
                self.frames += 1;
            }
            self.pending.drain(..count);
        }
    }
}

#[no_mangle]
pub extern "C" fn core_push(samples: usize) -> i32 {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        let Some(state) = state.as_mut() else { return -1; };
        if state.finished || samples == 0 || samples > CAPACITY || !samples.is_multiple_of(state.channels) { return -2; }
        if state.input[..samples].iter().any(|v| !v.is_finite() || v.abs() > 1e6) { return -3; }
        if let Some(resampler) = &mut state.resampler {
            if resampler.process(&state.input[..samples], &mut state.pending).is_err() { return -4; }
        } else { state.pending.extend_from_slice(&state.input[..samples]); }
        state.consume(false); 0
    })
}
#[no_mangle]
pub extern "C" fn core_finish() -> i32 {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        let Some(state) = state.as_mut() else { return -1; };
        if state.finished { return -2; }
        if let Some(resampler) = &mut state.resampler {
            if resampler.finish(&mut state.pending).is_err() { return -3; }
        }
        state.consume(true); state.finished = true; 0
    })
}
#[no_mangle]
pub extern "C" fn core_read(field: usize, mean: u32) -> f64 {
    STATE.with(|s| {
        let state = s.borrow();
        let Some(state) = state.as_ref() else { return f64::NAN; };
        if field == WIDTH { return state.frames as f64; }
        if field == WIDTH + 1 { return state.frames as f64 / 2000.0; }
        if field >= WIDTH || state.frames == 0 { return f64::NAN; }
        if mean == 0 { state.last[field] } else { state.sums[field] / state.frames as f64 }
    })
}
#[no_mangle]
pub extern "C" fn core_drop() { STATE.with(|s| *s.borrow_mut() = None); }
