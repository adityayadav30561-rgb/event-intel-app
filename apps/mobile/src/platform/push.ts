/** Native builds would use the platform's push service; the app ships as a web app. */
export type PushStatus = 'on' | 'off' | 'denied' | 'needs_install' | 'unsupported' | 'unavailable';
export const pushStatus = async (): Promise<PushStatus> => 'unsupported';
export const enablePush = async (): Promise<PushStatus> => 'unsupported';
export const disablePush = async (): Promise<void> => {};
export const refreshPushRegistration = async (): Promise<void> => {};
