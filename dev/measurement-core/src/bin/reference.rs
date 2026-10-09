//! Local oracle: exactly the same Rust API compiled natively, not a product binary.
use kirin_web_level_core::*;
use std::io::{self, Read};
fn number(v: f64) -> String { if v.is_finite() { format!("{v:.17}") } else { "null".into() } }
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let rate: u32 = args[1].parse().unwrap();
    let channels: usize = args[2].parse().unwrap();
    let mut bytes = Vec::new(); io::stdin().read_to_end(&mut bytes).unwrap();
    assert!(bytes.len().is_multiple_of(8 * channels));
    assert_eq!(core_init(rate, channels as u32), 0);
    let mut rows = Vec::new();
    for chunk in bytes.chunks(rate as usize / 10 * channels * 8) {
        for (i, sample) in chunk.chunks_exact(8).enumerate() {
            unsafe { *core_input_ptr().add(i) = f64::from_le_bytes(sample.try_into().unwrap()); }
        }
        assert_eq!(core_push(chunk.len() / 8), 0);
        rows.push(format!("[{}, {}, {}]", number(core_read(1, 0)), number(core_read(2, 0)), number((0..channels).map(|c| core_read(5, c as u32)).fold(0.0, f64::max))));
    }
    println!("{{\"integrated\":{},\"lra\":{},\"channelPeak\":[{}],\"rows\":[{}]}}", number(core_read(0, 0)), number(core_read(3, 0)), (0..channels).map(|c| number(core_read(4, c as u32))).collect::<Vec<_>>().join(","), rows.join(","));
    core_drop();
}
