export interface ProfileApi {
  switchToProfile(deviceId: string, profileName?: string): Promise<void> | void;
}

export class ProfileSwitcher {
  private inProfile = false;

  constructor(
    private api: ProfileApi,
    private deviceId: () => string | null,
    private profileName: string,
  ) {}

  async enter(): Promise<void> {
    if (this.inProfile) return;
    const id = this.deviceId();
    if (!id) return;
    this.inProfile = true;
    await this.api.switchToProfile(id, this.profileName);
  }

  async leave(): Promise<void> {
    if (!this.inProfile) return;
    this.inProfile = false;
    const id = this.deviceId();
    if (!id) return;
    await this.api.switchToProfile(id);
  }
}
