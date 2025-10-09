type BadgeNumberProps = {
  number: number
}

function BadgeNumber({ number }: BadgeNumberProps) {
  if (number <= 0) {
    console.error('BadgeNumber: number must be positive, received:', number)
  }
  return (
    <span className="text-brand-50 bg-brand-200 border-brand-100 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border">
      {number}
    </span>
  )
}

export { BadgeNumber }
