const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const memoTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Dhaka',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

type DateValue = string | number | Date

const asDate = (value: DateValue) => value instanceof Date ? value : new Date(value)

export const formatUiDate = (value: DateValue) => dateFormatter.format(asDate(value))

// Intl may insert a narrow no-break space before AM/PM; normalize it to a plain space.
export const formatMemoDateTime = (value: DateValue) => `${formatUiDate(value)} ${memoTimeFormatter.format(asDate(value)).replace(/\s/g, ' ')}`

export const formatUiTime = (value: DateValue) => timeFormatter.format(asDate(value))

export const formatUiDateTime = (value: DateValue) => `${formatUiDate(value)} ${formatUiTime(value)}`
