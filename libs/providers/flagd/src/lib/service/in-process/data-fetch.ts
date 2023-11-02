export interface DataFetch {
  connect(dataFillCallback: (flags: string) => void, reconnectCallback: () => void, changedCallback: (flagsChanged: string[]) => void, disconnectCallback: () => void): void;

  disconnect(): void;
}
