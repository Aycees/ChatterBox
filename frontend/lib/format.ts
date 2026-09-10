// Message timestamps. Chat has two distinct jobs here: the exact time a
// message landed (next to the bubble) and the day it landed on (the divider
// between runs), so they get two formatters rather than one compromise.

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

// "Today"/"Yesterday" carry more meaning than a date for the two days that
// account for most of what anyone scrolls back through.
export function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return dayFormat.format(date);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

// "ada is typing" reads better than "1 person is typing", and past two names
// the list stops being useful -- fall back to a count.
export function describeTyping(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names.length} people are typing`;
}
