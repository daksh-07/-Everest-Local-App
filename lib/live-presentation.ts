/** Presentation state is derived only from the server's lifecycle. A dropped realtime connection
 * never replaces the last confirmed server state; it is reported separately in `connection`. */
export function livePresentation(status: string | null | undefined, reconnecting = false) {
  const searching = status === 'SEARCHING' || status === 'NOTIFYING';
  const finished = status === 'NO_PROVIDER_FOUND' || status === 'EXPIRED';
  const booked = status === 'BOOKED' || status === 'PROVIDER_SELECTED';
  const cancelled = status === 'CANCELLED';
  return {
    searching: searching && !reconnecting,
    finished,
    terminal: finished || booked || cancelled,
    title: booked ? 'Provider selected' : cancelled ? 'Search cancelled' : finished ? 'No available provider yet' : status === 'RESPONSES_AVAILABLE' ? 'Your responses are ready' : status ? 'Finding someone now' : 'Loading your request',
    label: booked ? 'Provider selected' : cancelled ? 'Cancelled' : finished ? 'Search ended' : status === 'RESPONSES_AVAILABLE' ? 'Responses available' : status ? 'Live search active' : 'Loading',
    connection: reconnecting ? 'Reconnecting · showing the last confirmed status' : null,
  };
}
