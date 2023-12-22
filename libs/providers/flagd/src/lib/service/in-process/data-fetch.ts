/**
 * Contract of in-process resolver's data fetcher
 */
export interface DataFetch {
  /**
   * Connects the data fetcher
   */
  connect(
    /**
     * Callback that runs when data is filled from the source
     * @param flags The flags from the source
     * @returns The flags that have changed
     */
    dataCallback: (flags: string) => string[],
    /**
     * Callback that runs when the connection is re-established
     */
    reconnectCallback: () => void,
    /**
     * Callback that runs when flags have changed
     * @param flagsChanged The flags that have changed
     */
    changedCallback: (flagsChanged: string[]) => void,
    /**
     * Callback that runs when the connection is disconnected
     * @param message The reason for the disconnection
     */
    disconnectCallback: (message: string) => void,
  ): Promise<void>;

  /**
   * Disconnects the data fetcher
   */
  disconnect(): Promise<void>;
}
