import type { NotificationSend, NotificationSendError } from '../../shared/charmiq';
import type { Job } from './jobs';

// the saved jobs no one was told about, as one notice. Every new job is sent under one
// replacement tag, so the newest send stands for the others: one notice names it and how
// many more went untold, and its retry is the newest send again. A retry is offered only
// where trying again can help; a refusal says why instead
// ********************************************************************************
/** a saved job whose notification was not accepted: `order` is its place among this
 *  device's sends, and a retry repeats it exactly, with the identifier the Platform gave
 *  the first send */
export type Unsent = Readonly<{ job: Job; order: number; notification: NotificationSend; submissionId?: string; }>;

/** the one notice of the jobs no one was told about */
export type UnsentNotice = Readonly<{
  /** the newest job not told of: its send, sent again, tells of the rest */
  latest: Unsent;
  /** how many earlier jobs went untold with it */
  others: number;
  /** whether trying again can help; when not, `reason` says why */
  retry: boolean;
  reason?: string;
  /** whether its retry is under way */
  sending: boolean;
}>;

// == Failure =====================================================================
/** the failures trying again can help: a lost answer (no code), a service busy or
 *  failing for now, or a sending limit, which passes */
const RETRIED = new Set([undefined, 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unknown', 'functions/aborted', 'functions/resource-exhausted']);
/** why a failure goes untold, where the notice says so: a limit to wait out, or a refusal,
 *  which is the same every time */
const reasonOf = (code: string | undefined): string | undefined => {
  switch(code) {
    case 'functions/resource-exhausted': return 'Too many were sent for now: try again in a minute.';
    case 'functions/permission-denied': return 'Only someone who can change the list can tell the others.';
    case 'functions/failed-precondition': return 'Notifications cannot be sent from here.';
    default: return RETRIED.has(code) ? undefined/*trying again says enough*/ : 'The Platform refused the notification.';
  }
};

// == Notice ======================================================================
/** the notice once `failed`'s send is not accepted: the newest untold job's, counting the
 *  earlier ones. A failed retry of the newest is the same notice */
export const sendFailed = (notice: UnsentNotice | null, failed: Unsent, failure: NotificationSendError | undefined): UnsentNotice | null => {
  if(notice && (notice.latest.order > failed.order)) return { ...notice, others: notice.others + 1 }/*a newer one already stands for it*/;

  const code = failure?.code, reason = reasonOf(code);
  const others = !notice ? 0/*the first untold*/ : (notice.latest.order === failed.order) ? notice.others/*its retry*/ : notice.others + 1;
  return {
    latest: { ...failed, ...((failure?.submissionId ?? failed.submissionId) && { submissionId: failure?.submissionId ?? failed.submissionId }) },
    others, retry: RETRIED.has(code), ...(reason && { reason }), sending: false,
  };
};

/** the notice once `sent`'s send is accepted: the newest told tells of every earlier one */
export const sendAccepted = (notice: UnsentNotice | null, sent: Unsent): UnsentNotice | null =>
  (notice && (sent.order < notice.latest.order)) ? notice/*a newer one is still untold*/ : null;

/** the notice while its retry is under way */
export const sendingAgain = (notice: UnsentNotice): UnsentNotice => ({ ...notice, sending: true });
