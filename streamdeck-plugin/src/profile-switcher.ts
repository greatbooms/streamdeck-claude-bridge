export interface ProfileApi {
  switchToProfile(deviceId: string, profileName?: string): Promise<void> | void;
}

export class ProfileSwitcher {
  private currentProfile: string | null = null;

  constructor(
    private api: ProfileApi,
    private deviceId: () => string | null,
    private profileName: string,
    private log: (msg: string) => void = () => {},
  ) {}

  async enter(profileName: string = this.profileName): Promise<void> {
    if (this.currentProfile === profileName) return;
    const id = this.deviceId();
    if (!id) {
      this.log("profile enter skipped: no device");
      return;
    }
    const previousProfile = this.currentProfile;
    this.currentProfile = profileName;
    try {
      await this.api.switchToProfile(id, profileName);
      this.log(`profile enter ok: ${profileName} on ${id}`);
    } catch (e) {
      // 전환 실패(예: 번들 안 된 프로파일은 SDK가 타임아웃) → 상태 되돌려
      // 다음 기회에 재시도 가능하게 하고, 미처리 거부로 프로세스가 죽지 않게 한다.
      this.currentProfile = previousProfile;
      this.log(`profile enter FAILED: ${profileName} on ${id}: ${String(e)}`);
    }
  }

  async leave(): Promise<void> {
    if (this.currentProfile === null) {
      this.log("profile leave skipped: not in profile");
      return;
    }
    this.currentProfile = null;
    const id = this.deviceId();
    if (!id) {
      this.log("profile leave: no device");
      return;
    }
    try {
      await this.api.switchToProfile(id); // 인자 없음 → 직전 프로파일 복귀
      this.log(`profile leave ok (return to previous) on ${id}`);
    } catch (e) {
      this.log(`profile leave FAILED on ${id}: ${String(e)}`);
    }
  }
}
