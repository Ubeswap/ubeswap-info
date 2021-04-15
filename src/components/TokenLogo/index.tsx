import UbeswapDefaultTokenList from '@ubeswap/default-token-list'
import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { isAddress } from '../../utils/index'

const BAD_IMAGES = {}

const Inline = styled.div`
  display: flex;
  align-items: center;
  align-self: center;
`

const Image = styled.img<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  background-color: white;
  border-radius: 50%;
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
`

type CommonProps = React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> &
  React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>

interface Props extends Omit<CommonProps, 'size' | 'ref' | 'as'> {
  address: string
  header?: boolean
  size?: string
}

export default function TokenLogo({ address, size = '24px', ...rest }: Props): JSX.Element {
  const tokenInfo = UbeswapDefaultTokenList.tokens.find((tok) => tok.address === isAddress(address))
  const path = tokenInfo?.logoURI
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [address])

  if (!path || error || BAD_IMAGES[address]) {
    return (
      <Inline>
        <span {...rest} style={{ fontSize: size }} role="img" aria-label="face">
          🤔
        </span>
      </Inline>
    )
  }

  return (
    <Inline>
      <Image
        {...rest}
        alt={''}
        src={path}
        size={size}
        onError={(event) => {
          BAD_IMAGES[address] = true
          setError(true)
          event.preventDefault()
        }}
      />
    </Inline>
  )
}
