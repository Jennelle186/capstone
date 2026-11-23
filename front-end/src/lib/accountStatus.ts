// The backend answers HTTP 423 (Locked) when the signed-in account has been deactivated.
// fetchWithClerkAuth reports that status here, and DeactivatedAccountWatcher signs the user out.
export const ACCOUNT_DEACTIVATED_STATUS = 423;
export const ACCOUNT_DEACTIVATED_EVENT = "edms:account-deactivated";
export const ACCOUNT_DEACTIVATED_MESSAGE =
  "Your account has been deactivated. Contact the administrator to restore access.";
export const ACCOUNT_DEACTIVATED_QUERY = "reason=deactivated";

export function notifyIfAccountDeactivated(response: Response): void {
  if (response.status === ACCOUNT_DEACTIVATED_STATUS) {
    window.dispatchEvent(new Event(ACCOUNT_DEACTIVATED_EVENT));
  }
}
