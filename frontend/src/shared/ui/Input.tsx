import { Input as MaxInput, type InputProps } from '@maxhub/max-ui'

export function Input(props: InputProps) {
  return (
    <MaxInput
      {...props}
      innerClassNames={{
        container: 'season-input',
        input: 'season-input-element',
        body: 'season-input-body',
      }}
    />
  )
}
