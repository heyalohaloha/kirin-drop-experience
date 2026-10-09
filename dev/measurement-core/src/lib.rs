//! Public MIT ebur128 only. No Kirin OS source, filesystem, host audio or threads.
use ebur128::{EbuR128, Mode};
use std::cell::RefCell;

const CAPACITY: usize = 38_400; // 100 ms of stereo at 192 kHz.
struct State {
    meter: EbuR128,
    input: Vec<f64>,
}
thread_local! { static STATE: RefCell<Option<State>> = const { RefCell::new(None) }; }

#[no_mangle]
pub extern "C" fn core_version() -> u32 { 1 }

#[no_mangle]
pub extern "C" fn core_init(rate: u32, channels: u32) -> i32 {
    core_drop();
    if !(8_000..=192_000).contains(&rate) || !(1..=2).contains(&channels) { return -1; }
    let mode = Mode::M | Mode::S | Mode::I | Mode::LRA | Mode::TRUE_PEAK;
    match EbuR128::new(channels, rate, mode) {
        Ok(meter) => { STATE.with(|s| *s.borrow_mut() = Some(State { meter, input: vec![0.0; CAPACITY] })); 0 }
        Err(_) => -2,
    }
}

#[no_mangle]
pub extern "C" fn core_input_ptr() -> *mut f64 {
    STATE.with(|s| s.borrow_mut().as_mut().map_or(std::ptr::null_mut(), |s| s.input.as_mut_ptr()))
}

#[no_mangle]
pub extern "C" fn core_input_capacity() -> u32 { CAPACITY as u32 }

#[no_mangle]
pub extern "C" fn core_push(samples: usize) -> i32 {
    STATE.with(|s| {
        let mut state = s.borrow_mut();
        let Some(state) = state.as_mut() else { return -1; };
        if samples == 0 || samples > CAPACITY || !samples.is_multiple_of(state.meter.channels() as usize) { return -2; }
        // Reject pathological floats rather than allowing filter overflow to look like silence.
        if state.input[..samples].iter().any(|v| !v.is_finite() || v.abs() > 1e6) { return -3; }
        state.meter.add_frames_f64(&state.input[..samples]).map_or(-4, |_| 0)
    })
}

#[no_mangle]
pub extern "C" fn core_read(field: u32, channel: u32) -> f64 {
    STATE.with(|s| {
        let state = s.borrow();
        let Some(state) = state.as_ref() else { return f64::NAN; };
        let meter = &state.meter;
        match field {
            0 => meter.loudness_global(),
            1 => meter.loudness_momentary(),
            2 => meter.loudness_shortterm(),
            3 => meter.loudness_range(),
            4 => meter.true_peak(channel),
            5 => meter.prev_true_peak(channel),
            6 => meter.relative_threshold(),
            _ => return f64::NAN,
        }.unwrap_or(f64::NAN)
    })
}

#[no_mangle]
pub extern "C" fn core_drop() { STATE.with(|s| *s.borrow_mut() = None); }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_state_and_input_are_explicit_and_reset_is_complete() {
        assert_eq!(core_init(4000, 1), -1);
        assert_eq!(core_push(1), -1);
        assert!(core_read(0, 0).is_nan());
        assert_eq!(core_init(48000, 2), 0);
        assert_eq!(core_push(3), -2);
        assert_eq!(core_push(CAPACITY + 2), -2);
        // The pointer is valid only while this instance remains initialised.
        unsafe { *core_input_ptr() = f64::NAN; }
        assert_eq!(core_push(2), -3);
        assert_eq!(core_init(48000, 1), 0);
        assert_eq!(core_push(4800), 0);
        assert_eq!(core_read(4, 0), 0.0);
        assert_eq!(core_read(0, 0), f64::NEG_INFINITY);
        core_drop(); assert!(core_input_ptr().is_null());
    }
}
