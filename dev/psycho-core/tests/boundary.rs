use kirin_web_psycho_core::*;
#[test]
fn adapter_rejects_invalid_input_finishes_once_and_clears_its_state() {
    assert_eq!(core_init(4000, 1), -1);
    assert_eq!(core_push(1), -1);
    assert_eq!(core_init(48000, 2), 0);
    assert_eq!(core_push(1), -2);
    unsafe { *core_input_ptr() = f64::INFINITY; }
    assert_eq!(core_push(2), -3);
    assert_eq!(core_init(48000, 1), 0);
    assert_eq!(core_push(4800), 0);
    assert_eq!(core_read(42, 0), 200.0);
    assert_eq!(core_read(0, 1), 0.0);
    assert_eq!(core_finish(), 0);
    assert_eq!(core_finish(), -2);
    assert_eq!(core_push(1), -2);
    core_drop(); assert!(core_read(0, 0).is_nan()); assert!(core_input_ptr().is_null());
}
