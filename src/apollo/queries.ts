import { DocumentNode } from 'graphql'
import gql from 'graphql-tag'

export const SUBGRAPH_HEALTH = gql`
  query Health {
    indexingStatusForCurrentVersion(subgraphName: "ubeswap/ubeswap") {
      synced
      health
      chains {
        chainHeadBlock {
          number
        }
        latestBlock {
          number
        }
      }
    }
  }
`

export const GET_BLOCK = gql`
  query GetBlock($timestampFrom: BigInt!, $timestampTo: BigInt!) {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gt: $timestampFrom, timestamp_lt: $timestampTo }
      subgraphError: allow
    ) {
      id
      number
      timestamp
    }
  }
`

export const GET_BLOCKS = (timestamps: readonly number[]): DocumentNode => {
  let queryString = 'query blocks {'
  queryString += timestamps.map((timestamp) => {
    return `t${timestamp}:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: ${timestamp}, timestamp_lt: ${
      timestamp + 600
    } }, subgraphError: allow) {
      number
    }`
  })
  queryString += '}'
  return gql(queryString)
}

export const POSITIONS_BY_BLOCK = (account, blocks) => {
  let queryString = 'query positionsByBlock {'
  queryString += blocks.map(
    (block) => `
      t${block.timestamp}:liquidityPositions(where: {user: "${account}"}, block: { number: ${block.number} }, subgraphError: allow) { 
        liquidityTokenBalance
        pair  {
          id
          totalSupply
          reserveUSD
        }
      }
    `
  )
  queryString += '}'
  return gql(queryString)
}

export const PRICES_BY_BLOCK = (
  tokenAddress: string,
  blocks: readonly { timestamp: number; number: number }[]
): DocumentNode => {
  let queryString = 'query pricesByBlock {'
  queryString += blocks.map(
    (block) => `
      t${block.timestamp}:token(id:"${tokenAddress}", block: { number: ${block.number} }, subgraphError: allow) { 
        derivedCUSD
      }
    `
  )
  queryString += ','
  queryString += blocks.map(
    (block) => `
      b${block.timestamp}: bundle(id:"1", block: { number: ${block.number} }, subgraphError: allow) { 
        celoPrice
      }
    `
  )

  queryString += '}'
  return gql(queryString)
}

export const TOP_LPS_PER_PAIRS = gql`
  query TopLpsPerPairs($pair: String!) {
    liquidityPositions(
      where: { pair: $pair }
      orderBy: liquidityTokenBalance
      orderDirection: desc
      first: 10
      subgraphError: allow
    ) {
      user {
        id
      }
      pair {
        id
      }
      liquidityTokenBalance
    }
  }
`

export const HOURLY_PAIR_RATES = (pairAddress, blocks) => {
  let queryString = 'query blocks {'
  queryString += blocks.map(
    (block) => `
      t${block.timestamp}: pair(id:"${pairAddress}", block: { number: ${block.number} }, subgraphError: allow) { 
        token0Price
        token1Price
      }
    `
  )

  queryString += '}'
  return gql(queryString)
}

const shareValueFragment = gql`
  fragment shareValue on Pair {
    reserve0
    reserve1
    reserveUSD
    totalSupply
    token0 {
      derivedCUSD
    }
    token1 {
      derivedCUSD
    }
  }
`

export const SHARE_VALUE = (
  pairAddress: string,
  blocks: readonly {
    timestamp: number
    number: number
  }[]
): DocumentNode => {
  let queryString = 'query HistoricalShareValue {'
  queryString += blocks.map(
    (block) => `
      t${block.timestamp}:pair(id:"${pairAddress}", block: { number: ${block.number} }, subgraphError: allow) { 
        ...shareValue
      }
    `
  )
  queryString += ','
  queryString += blocks.map(
    (block) => `
      b${block.timestamp}: bundle(id:"1", block: { number: ${block.number} }, subgraphError: allow) { 
        celoPrice
      }
    `
  )

  queryString += '}'
  // insert share value fragment
  queryString += shareValueFragment.loc?.source.body ?? ''
  return gql(queryString)
}

export const CURRENT_CELO_PRICE = gql`
  query CurrentCeloPrice {
    bundles(where: { id: "1" }, subgraphError: allow) {
      id
      celoPrice
    }
  }
`

export const CELO_PRICE = gql`
  query CeloPrice($block: Int!) {
    bundles(where: { id: "1" }, block: { number: $block }, subgraphError: allow) {
      id
      celoPrice
    }
  }
`

export const USER_MINTS_BUNRS_PER_PAIR = gql`
  query UserMintsBurnsPerPair($user: Bytes, $pair: String!) {
    mints(where: { to: $user, pair: $pair }, subgraphError: allow) {
      amountUSD
      amount0
      amount1
      timestamp
      pair {
        token0 {
          id
        }
        token1 {
          id
        }
      }
    }
    burns(where: { sender: $user, pair: $pair }, subgraphError: allow) {
      amountUSD
      amount0
      amount1
      timestamp
      pair {
        token0 {
          id
        }
        token1 {
          id
        }
      }
    }
  }
`

export const FIRST_SNAPSHOT = gql`
  query FirstSnapshot($user: String) {
    liquidityPositionSnapshots(
      first: 1
      where: { user: $user }
      orderBy: timestamp
      orderDirection: asc
      subgraphError: allow
    ) {
      timestamp
    }
  }
`

export const USER_HISTORY = gql`
  query UserHistory($user: String!, $skip: Int!) {
    liquidityPositionSnapshots(first: 1000, skip: $skip, where: { user: $user }, subgraphError: allow) {
      timestamp
      reserveUSD
      liquidityTokenBalance
      liquidityTokenTotalSupply
      reserve0
      reserve1
      token0PriceUSD
      token1PriceUSD
      pair {
        id
        reserve0
        reserve1
        reserveUSD
        token0 {
          id
        }
        token1 {
          id
        }
      }
    }
  }
`

export const liquidityPairFragment = gql`
  fragment liquidityPair on Pair {
    id
    reserve0
    reserve1
    reserveUSD
    token0 {
      id
      symbol
      derivedCUSD
    }
    token1 {
      id
      symbol
      derivedCUSD
    }
    totalSupply
  }
`

export const USER_POSITIONS = gql`
  query liquidityPositions($user: String!) {
    liquidityPositions(where: { user: $user }, subgraphError: allow) {
      pair {
        id
        ...liquidityPair
      }
      liquidityTokenBalance
    }
  }
`

export const USER_TRANSACTIONS = gql`
  query UserTransactions($user: Bytes) {
    mints(orderBy: timestamp, orderDirection: desc, where: { to: $user }, subgraphError: allow) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        id
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      to
      liquidity
      amount0
      amount1
      amountUSD
    }
    burns(orderBy: timestamp, orderDirection: desc, where: { sender: $user }, subgraphError: allow) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        id
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      sender
      to
      liquidity
      amount0
      amount1
      amountUSD
    }
    swaps(orderBy: timestamp, orderDirection: desc, where: { to: $user }) {
      id
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          symbol
        }
        token1 {
          symbol
        }
      }
      amount0In
      amount0Out
      amount1In
      amount1Out
      amountUSD
      to
    }
  }
`

export const PAIR_CHART = gql`
  query PairDayDatasChart($pairAddress: Bytes!, $skip: Int!) {
    pairDayDatas(
      first: 1000
      skip: $skip
      orderBy: date
      orderDirection: asc
      where: { pairAddress: $pairAddress }
      subgraphError: allow
    ) {
      id
      date
      dailyVolumeToken0
      dailyVolumeToken1
      dailyVolumeUSD
      reserveUSD
    }
  }
`

export const PAIR_DAY_DATA = gql`
  query PairDayDatas($pairAddress: Bytes!, $date: Int!) {
    pairDayDatas(
      first: 1
      orderBy: date
      orderDirection: desc
      where: { pairAddress: $pairAddress, date_lt: $date }
      subgraphError: allow
    ) {
      id
      date
      dailyVolumeToken0
      dailyVolumeToken1
      dailyVolumeUSD
      totalSupply
      reserveUSD
    }
  }
`

export const PAIR_DAY_DATA_BULK = (pairs, startTimestamp) => {
  let pairsString = `[`
  pairs.map((pair) => {
    return (pairsString += `"${pair}"`)
  })
  pairsString += ']'
  const queryString = `
    query PairDayDataBulk {
      pairDayDatas(first: 1000, orderBy: date, orderDirection: asc, where: { pairAddress_in: ${pairsString}, date_gt: ${startTimestamp} }, subgraphError: allow) {
        id
        pairAddress
        date
        dailyVolumeToken0
        dailyVolumeToken1
        dailyVolumeUSD
        totalSupply
        reserveUSD
      }
    } 
`
  return gql(queryString)
}

export const GLOBAL_CHART = gql`
  query ubeswapDayDatas($startTime: Int!, $skip: Int!) {
    ubeswapDayDatas(
      first: 1000
      skip: $skip
      where: { date_gt: $startTime }
      orderBy: date
      orderDirection: asc
      subgraphError: allow
    ) {
      id
      date
      totalVolumeUSD
      dailyVolumeUSD
      dailyVolumeCELO
      totalLiquidityUSD
      totalLiquidityCELO
    }
  }
`

export const GLOBAL_DATA_LATEST = gql`
  query GlobalDataLatest($factoryAddress: ID!) {
    ubeswapFactories(where: { id: $factoryAddress }, subgraphError: allow) {
      id
      totalVolumeUSD
      totalVolumeCELO
      untrackedVolumeUSD
      totalLiquidityUSD
      totalLiquidityCELO
      txCount
      pairCount
    }
  }
`

export const GLOBAL_DATA = gql`
  query GlobalData($block: Int!, $factoryAddress: ID!) {
    ubeswapFactories(block: { number: $block }, where: { id: $factoryAddress }, subgraphError: allow) {
      id
      totalVolumeUSD
      totalVolumeCELO
      untrackedVolumeUSD
      totalLiquidityUSD
      totalLiquidityCELO
      txCount
      pairCount
    }
  }
`

export const GLOBAL_TXNS = gql`
  query GlobalTransactions {
    transactions(first: 100, orderBy: timestamp, orderDirection: desc, subgraphError: allow) {
      mints(orderBy: timestamp, orderDirection: desc) {
        transaction {
          id
          timestamp
        }
        pair {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        to
        liquidity
        amount0
        amount1
        amountUSD
      }
      burns(orderBy: timestamp, orderDirection: desc) {
        transaction {
          id
          timestamp
        }
        pair {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        sender
        liquidity
        amount0
        amount1
        amountUSD
      }
      swaps(orderBy: timestamp, orderDirection: desc) {
        transaction {
          id
          timestamp
        }
        pair {
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
        amount0In
        amount0Out
        amount1In
        amount1Out
        amountUSD
        to
      }
    }
  }
`

export const ALL_TOKENS = gql`
  query AllTokens($skip: Int!) {
    tokens(first: 250, skip: $skip, subgraphError: allow) {
      id
      name
      symbol
      totalLiquidity
    }
  }
`

export const TOKEN_SEARCH = gql`
  query TokenSearch($value: String, $id: ID) {
    asSymbol: tokens(
      where: { symbol_contains: $value }
      orderBy: totalLiquidity
      orderDirection: desc
      subgraphError: allow
    ) {
      id
      symbol
      name
      totalLiquidity
    }
    asName: tokens(
      where: { name_contains: $value }
      orderBy: totalLiquidity
      orderDirection: desc
      subgraphError: allow
    ) {
      id
      symbol
      name
      totalLiquidity
    }
    asAddress: tokens(where: { id: $id }, orderBy: totalLiquidity, orderDirection: desc, subgraphError: allow) {
      id
      symbol
      name
      totalLiquidity
    }
  }
`

export const PAIR_SEARCH = gql`
  query pairs($tokens: [String!], $id: ID) {
    as0: pairs(where: { token0_in: $tokens }, subgraphError: allow) {
      id
      token0 {
        id
        symbol
        name
      }
      token1 {
        id
        symbol
        name
      }
    }
    as1: pairs(where: { token1_in: $tokens }, subgraphError: allow) {
      id
      token0 {
        id
        symbol
        name
      }
      token1 {
        id
        symbol
        name
      }
    }
    asAddress: pairs(where: { id: $id }, subgraphError: allow) {
      id
      token0 {
        id
        symbol
        name
      }
      token1 {
        id
        symbol
        name
      }
    }
  }
`

export const ALL_PAIRS = gql`
  query AllPairs($skip: Int!) {
    pairs(first: 250, skip: $skip, orderBy: trackedReserveUSD, orderDirection: desc, subgraphError: allow) {
      id
      token0 {
        id
        symbol
        name
      }
      token1 {
        id
        symbol
        name
      }
    }
  }
`

const PairFields = gql`
  fragment PairFields on Pair {
    id
    txCount
    token0 {
      id
      symbol
      name
      totalLiquidity
      derivedCUSD
    }
    token1 {
      id
      symbol
      name
      totalLiquidity
      derivedCUSD
    }
    reserve0
    reserve1
    reserveUSD
    totalSupply
    trackedReserveUSD
    reserveCELO
    volumeUSD
    untrackedVolumeUSD
    token0Price
    token1Price
    createdAtTimestamp
    createdAtBlockNumber
  }
`

export const PAIRS_CURRENT = gql`
  query PairsCurrent {
    pairs(first: 200, orderBy: reserveUSD, orderDirection: desc, subgraphError: allow) {
      id
    }
  }
`

export const PAIR_DATA: DocumentNode = gql`
  query PairData($block: Int, $pairAddress: ID!) {
    pairs(block: { number: $block }, where: { id: $pairAddress }, subgraphError: allow) {
      ...PairFields
    }
  }
  ${PairFields}
`

export const PAIRS_BULK = gql`
  ${PairFields}
  query PairsBulk($allPairs: [ID!]!) {
    pairs(
      first: 250
      where: { id_in: $allPairs }
      orderBy: trackedReserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      ...PairFields
    }
  }
`

export const PAIRS_HISTORICAL_BULK = gql`
  query PairsHistoricalBulk($pairs: [ID!]!, $block: Int!) {
    pairs(
      first: 100
      where: { id_in: $pairs }
      block: { number: $block }
      orderBy: trackedReserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      id
      reserveUSD
      trackedReserveUSD
      volumeUSD
      untrackedVolumeUSD
    }
  }
`

export const TOKEN_CHART = gql`
  query TokenDayDatas($tokenAddr: String!, $skip: Int!) {
    tokenDayDatas(
      first: 1000
      skip: $skip
      orderBy: date
      orderDirection: asc
      where: { token: $tokenAddr }
      subgraphError: allow
    ) {
      id
      date
      priceUSD
      totalLiquidityToken
      totalLiquidityUSD
      totalLiquidityCELO
      dailyVolumeCELO
      dailyVolumeToken
      dailyVolumeUSD
    }
  }
`

const TokenFields = gql`
  fragment TokenFields on Token {
    id
    name
    symbol
    derivedCUSD
    tradeVolumeUSD
    tradeVolumeUSD
    untrackedVolumeUSD
    totalLiquidity
    txCount
  }
`

export const TOKENS_CURRENT = gql`
  ${TokenFields}
  query TokensCurrent {
    tokens(first: 200, orderBy: tradeVolumeUSD, orderDirection: desc, subgraphError: allow) {
      ...TokenFields
    }
  }
`

export const TOKENS_DYNAMIC = gql`
  query TokensDynamic($block: Int!) {
    tokens(block: { number: $block }, first: 200, orderBy: tradeVolumeUSD, orderDirection: desc, subgraphError: allow) {
      ...TokenFields
    }
  }
  ${TokenFields}
`

export const TOKEN_DATA_LATEST = gql`
  query TokenDataLatest($tokenAddress: String!, $tokenAddressID: ID!) {
    tokens(where: { id: $tokenAddressID }, subgraphError: allow) {
      ...TokenFields
    }
    pairs0: pairs(
      where: { token0: $tokenAddress }
      first: 50
      orderBy: reserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      id
    }
    pairs1: pairs(
      where: { token1: $tokenAddress }
      first: 50
      orderBy: reserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      id
    }
  }
  ${TokenFields}
`

export const TOKEN_DATA = gql`
  query TokenData($block: Int, $tokenAddress: String!, $tokenAddressID: ID!) {
    tokens(block: { number: $block }, where: { id: $tokenAddressID }, subgraphError: allow) {
      ...TokenFields
    }
    pairs0: pairs(
      where: { token0: $tokenAddress }
      first: 50
      orderBy: reserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      id
    }
    pairs1: pairs(
      where: { token1: $tokenAddress }
      first: 50
      orderBy: reserveUSD
      orderDirection: desc
      subgraphError: allow
    ) {
      id
    }
  }
  ${TokenFields}
`

export const FILTERED_TRANSACTIONS = gql`
  query FilteredTransactions($allPairs: [String!]!) {
    mints(first: 20, where: { pair_in: $allPairs }, orderBy: timestamp, orderDirection: desc, subgraphError: allow) {
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      to
      liquidity
      amount0
      amount1
      amountUSD
    }
    burns(first: 20, where: { pair_in: $allPairs }, orderBy: timestamp, orderDirection: desc) {
      transaction {
        id
        timestamp
      }
      pair {
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      sender
      liquidity
      amount0
      amount1
      amountUSD
    }
    swaps(first: 30, where: { pair_in: $allPairs }, orderBy: timestamp, orderDirection: desc) {
      transaction {
        id
        timestamp
      }
      id
      pair {
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
      amount0In
      amount0Out
      amount1In
      amount1Out
      amountUSD
      to
    }
  }
`
