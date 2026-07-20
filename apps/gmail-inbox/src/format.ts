// display formatting helpers
// ********************************************************************************
/** a compact list-cell date: the time for today's mail, else the month + day */
export const formatListDate = (dateHeader: string): string => {
  const date = new Date(dateHeader);
  if(Number.isNaN(date.getTime())) return ''/*unparseable header*/;

  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// --------------------------------------------------------------------------------
/** the full, localized date for the detail header */
export const formatFullDate = (dateHeader: string): string => {
  const date = new Date(dateHeader);
  return Number.isNaN(date.getTime()) ? dateHeader : date.toLocaleString();
};
