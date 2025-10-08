function BadgeNumber({ number }: { number: number }) {
  return (
    <span className="text-brand-50 bg-brand-200 border-brand-100 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border">
      {number}
    </span>
  )
}

export { BadgeNumber }
