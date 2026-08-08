export interface ExternalContextProvider {
  getContext(): Promise<null>;
}

export class DisabledExternalContextProvider implements ExternalContextProvider {
  async getContext(): Promise<null> {
    return null;
  }
}
