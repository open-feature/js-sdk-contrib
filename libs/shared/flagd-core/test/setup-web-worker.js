// Sets a flag so tests can detect they are running in the edge runtime project.
// Used to branch on the one assertion that differs between compiled and interpreter mode.
global.__webWorker__ = true;
