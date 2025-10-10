type BadgeNumberProps = {
  number: number
}

function BadgeNumber({ number }: BadgeNumberProps) {
  if (number <= 0) {
    console.error('BadgeNumber: number must be positive, received:', number)
  }

  return (
    <span className="text-brand-500 bg-brand-950 border-brand-900 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border">
      {number}
    </span>
  )
}

export { BadgeNumber }
