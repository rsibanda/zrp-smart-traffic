import {
  Children,
  cloneElement,
  isValidElement,
  ReactNode,
  useId,
  useState,
} from 'react';

// Display the browser's existing validation rules beside the relevant field.
// Submission constraints and server validation remain unchanged.
export function Field({ children }: { children: ReactNode }) {
  const id = useId();
  const [error, setError] = useState('');
  function feedback(target: EventTarget) {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      setError(target.validationMessage);
    }
  }
  return (
    <div
      className="field"
      onInvalidCapture={(event) => feedback(event.target)}
      onBlurCapture={(event) => feedback(event.target)}
      onInputCapture={(event) => {
        if (error) feedback(event.target);
      }}
    >
      <label>
        {Children.map(children, (child) => {
          if (
            !isValidElement<{
              'aria-describedby'?: string;
              'aria-invalid'?: boolean;
            }>(child) ||
            !['input', 'select', 'textarea'].includes(String(child.type))
          )
            return child;
          return cloneElement(child, {
            'aria-describedby':
              [child.props['aria-describedby'], error ? id : undefined]
                .filter(Boolean)
                .join(' ') || undefined,
            'aria-invalid': error ? true : undefined,
          });
        })}
      </label>
      {error && (
        <span id={id} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
