export interface ProfileApi {
  switchToProfile(deviceId: string, profileName?: string): Promise<void> | void;
}

export class ProfileSwitcher {
  private inProfile = false;

  constructor(
    private api: ProfileApi,
    private deviceId: () => string | null,
    private profileName: string,
    private log: (msg: string) => void = () => {},
  ) {}

  async enter(): Promise<void> {
    if (this.inProfile) return;
    const id = this.deviceId();
    if (!id) {
      this.log("profile enter skipped: no device");
      return;
    }
    this.inProfile = true;
    try {
      await this.api.switchToProfile(id, this.profileName);
      this.log(`profile enter ok: ${this.profileName} on ${id}`);
    } catch (e) {
      // 전환 실패(예: 번들 안 된 프로파일은 SDK가 타임아웃) → 상태 되돌려
      // 다음 기회에 재시도 가능하게 하고, 미처리 거부로 프로세스가 죽지 않게 한다.
      this.inProfile = false;
      this.log(`profile enter FAILED: ${this.profileName} on ${id}: ${String(e)}`);
    }
  }

  async leave(): Promise<void> {
    if (!this.inProfile) {
      this.log("profile leave skipped: not in profile");
      return;
    }
    this.inProfile = false;
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
