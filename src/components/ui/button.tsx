import { forwardRef } from 'react'
import './button.css'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'cancel'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = '', variant = 'primary', size = 'md', disabled = false, isLoading = false, children, ...props },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        className={`button button-${variant} button-${size} ${isDisabled ? 'disabled' : ''} ${className}`}
        disabled={isDisabled}
        ref={ref}
        {...props}
      >
        {isLoading ? (
          <>
            <span aria-hidden="true" className="button-spinner" />
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
