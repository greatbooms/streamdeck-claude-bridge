import { action, SingletonAction } from "@elgato/streamdeck";

/**
 * 표시 전용 액션. 첫 줄에 Claude Code 로고/배너를 깔기 위한 것으로,
 * 눌러도 아무 동작도 하지 않는다(버튼 이미지는 프로파일에서 배너 조각으로 교체).
 */
@action({ UUID: "com.shinsanghoon.claude-bridge.logo" })
export class LogoAction extends SingletonAction {}
