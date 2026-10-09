//! Native build of the browser adapter; not a shipping Hypha or OS binary.
use kirin_web_psycho_core::*;
use std::io::{self, Read};
fn number(v: f64) -> String { if v.is_finite() { format!("{v:.17}") } else { "null".into() } }
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rate: u32 = args[1].parse().unwrap();
    let channels: usize = args[2].parse().unwrap();
    let mut bytes = Vec::new(); io::stdin().read_to_end(&mut bytes).unwrap();
    assert!(bytes.len().is_multiple_of(8 * channels));
    assert_eq!(core_init(rate, channels as u32), 0);
    for chunk in bytes.chunks(rate as usize / 10 * channels * 8) {
        for (i, sample) in chunk.chunks_exact(8).enumerate() {
            unsafe { *core_input_ptr().add(i) = f64::from_le_bytes(sample.try_into().unwrap()); }
        }
        assert_eq!(core_push(chunk.len() / 8), 0);
    }
    assert_eq!(core_finish(), 0);
    println!("{{\"means\":[{}],\"frames\":{}}}", (0..42).map(|field| number(core_read(field, 1))).collect::<Vec<_>>().join(","), core_read(42, 0));
    core_drop();
}
