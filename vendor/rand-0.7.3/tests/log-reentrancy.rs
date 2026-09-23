#![cfg(feature = "log")]

use rand::{Error, RngCore, SeedableRng};

struct RejectLogger;

impl log::Log for RejectLogger {
    fn enabled(&self, _: &log::Metadata<'_>) -> bool { true }
    fn log(&self, _: &log::Record<'_>) {
        panic!("RNG called user logging code while borrowing its state");
    }
    fn flush(&self) {}
}

struct FailedSeed;

impl RngCore for FailedSeed {
    fn next_u32(&mut self) -> u32 { panic!("unexpected reseeder method") }
    fn next_u64(&mut self) -> u64 { panic!("unexpected reseeder method") }
    fn fill_bytes(&mut self, _: &mut [u8]) { panic!("unexpected reseeder method") }
    fn try_fill_bytes(&mut self, _: &mut [u8]) -> Result<(), Error> {
        Err(Error::new(std::io::Error::new(std::io::ErrorKind::Other, "seed unavailable")))
    }
}

#[test]
fn reseeding_never_calls_user_logger() {
    static LOGGER: RejectLogger = RejectLogger;
    log::set_logger(&LOGGER).unwrap();
    log::set_max_level(log::LevelFilter::Trace);

    // Periodic ThreadRng reseeding after the 64 KiB threshold.
    let mut bytes = vec![0u8; 128 * 1024];
    rand::thread_rng().fill_bytes(&mut bytes);

    // Failed reseeding must not call a warning logger either.
    let core = rand_chacha::ChaCha20Core::from_seed([0; 32]);
    let mut rng = rand::rngs::adapter::ReseedingRng::new(core, 32, FailedSeed);
    rng.fill_bytes(&mut bytes[..1024]);
}
