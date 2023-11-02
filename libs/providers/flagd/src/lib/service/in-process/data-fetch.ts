export interface DataFetch {
  connect(dataFillCallback: (flags: string) => void,
          connectCallback: () => void,
          changedCallback: (flagsChanged: string[]) => void,
          disconnectCallback: () => void): Promise<void>;

  disconnect(): void;
}
