import { ApolloQueryResult } from 'apollo-client'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'

import { client } from '../apollo/client'
import {
  FilteredTransactionsQuery,
  FilteredTransactionsQueryVariables,
  TokenDataLatestQuery,
  TokenDataLatestQueryVariables,
  TokenDataQuery,
  TokenDataQueryVariables,
  TokenDayDatasQuery,
  TokenDayDatasQueryVariables,
  TokensCurrentQuery,
  TokensDynamicQuery,
  TokensDynamicQueryVariables,
} from '../apollo/generated/types'
import {
  FILTERED_TRANSACTIONS,
  PRICES_BY_BLOCK,
  TOKEN_CHART,
  TOKEN_DATA,
  TOKEN_DATA_LATEST,
  TOKENS_CURRENT,
  TOKENS_DYNAMIC,
} from '../apollo/queries'
import { ALL_MAINNET_TOKENS_MAP, timeframeOptions } from '../constants'
import {
  get2DayPercentChange,
  getBlockFromTimestamp,
  getBlocksFromTimestamps,
  getPercentChange,
  isAddress,
  splitQuery,
} from '../utils'
import { updateNameData } from '../utils/data'
import { useLatestBlocks } from './Application'

const UPDATE = 'UPDATE'
const UPDATE_TOKEN_TXNS = 'UPDATE_TOKEN_TXNS'
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA'
const UPDATE_PRICE_DATA = 'UPDATE_PRICE_DATA'
const UPDATE_TOP_TOKENS = ' UPDATE_TOP_TOKENS'
const UPDATE_ALL_PAIRS = 'UPDATE_ALL_PAIRS'
const UPDATE_COMBINED = 'UPDATE_COMBINED'

const TOKEN_PAIRS_KEY = 'TOKEN_PAIRS_KEY'

dayjs.extend(utc)

const TokenDataContext = createContext(undefined)

function useTokenDataContext() {
  return useContext(TokenDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { tokenAddress, data } = payload
      return {
        ...state,
        [tokenAddress]: {
          ...state?.[tokenAddress],
          ...data,
        },
      }
    }
    case UPDATE_TOP_TOKENS: {
      const { topTokens } = payload
      const added = {}
      topTokens &&
        topTokens.map((token) => {
          return (added[token.id] = token)
        })
      return {
        ...state,
        ...added,
      }
    }

    case UPDATE_COMBINED: {
      const { combinedVol } = payload
      return {
        ...state,
        combinedVol,
      }
    }

    case UPDATE_TOKEN_TXNS: {
      const { address, transactions } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          txns: transactions,
        },
      }
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          chartData,
        },
      }
    }

    case UPDATE_PRICE_DATA: {
      const { address, data, timeWindow, interval } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [timeWindow]: {
            ...state?.[address]?.[timeWindow],
            [interval]: data,
          },
        },
      }
    }

    case UPDATE_ALL_PAIRS: {
      const { address, allPairs } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          [TOKEN_PAIRS_KEY]: allPairs,
        },
      }
    }
    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, {})
  const update = useCallback((tokenAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        tokenAddress,
        data,
      },
    })
  }, [])

  const updateTopTokens = useCallback((topTokens) => {
    dispatch({
      type: UPDATE_TOP_TOKENS,
      payload: {
        topTokens,
      },
    })
  }, [])

  const updateCombinedVolume = useCallback((combinedVol) => {
    dispatch({
      type: UPDATE_COMBINED,
      payload: {
        combinedVol,
      },
    })
  }, [])

  const updateTokenTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_TOKEN_TXNS,
      payload: { address, transactions },
    })
  }, [])

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData },
    })
  }, [])

  const updateAllPairs = useCallback((address, allPairs) => {
    dispatch({
      type: UPDATE_ALL_PAIRS,
      payload: { address, allPairs },
    })
  }, [])

  const updatePriceData = useCallback((address, data, timeWindow, interval) => {
    dispatch({
      type: UPDATE_PRICE_DATA,
      payload: { address, data, timeWindow, interval },
    })
  }, [])

  return (
    <TokenDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updateTokenTxns,
            updateChartData,
            updateTopTokens,
            updateAllPairs,
            updatePriceData,
            updateCombinedVolume,
          },
        ],
        [
          state,
          update,
          updateTokenTxns,
          updateCombinedVolume,
          updateChartData,
          updateTopTokens,
          updateAllPairs,
          updatePriceData,
        ]
      )}
    >
      {children}
    </TokenDataContext.Provider>
  )
}

const getTopTokens = async () => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime.subtract(1, 'day').unix()
  const utcTwoDaysBack = utcCurrentTime.subtract(2, 'day').unix()
  const oneDayBlock = await getBlockFromTimestamp(utcOneDayBack)
  const twoDayBlock = await getBlockFromTimestamp(utcTwoDaysBack)

  console.log('top tokens')

  try {
    const current = await client.query<TokensCurrentQuery>({
      query: TOKENS_CURRENT,
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
    })

    const oneDayResult: ApolloQueryResult<TokensDynamicQuery> | null = await client
      .query<TokensDynamicQuery, TokensDynamicQueryVariables>({
        query: TOKENS_DYNAMIC,
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
        variables: {
          block: oneDayBlock,
        },
      })
      .catch((e) => {
        console.error(e)
        return null
      })

    const twoDayResult: ApolloQueryResult<TokensDynamicQuery> | null = await client
      .query<TokensDynamicQuery, TokensDynamicQueryVariables>({
        query: TOKENS_DYNAMIC,
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
        variables: {
          block: twoDayBlock,
        },
      })
      .catch((e) => {
        console.error(e)
        return null
      })

    const oneDayData = oneDayResult?.data?.tokens.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur }
    }, {})

    const twoDayData = twoDayResult?.data?.tokens.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur }
    }, {})

    const bulkResults = await Promise.all(
      (current &&
        current?.data?.tokens?.map(async (token) => {
          const data = token
          if (data) {
            const addressChecksum = isAddress(data.id)
            const tokenInfo = addressChecksum ? ALL_MAINNET_TOKENS_MAP[addressChecksum] : null
            if (tokenInfo) {
              data.logoURI = tokenInfo.logoURI
              data.name = tokenInfo.name
              data.symbol = tokenInfo.symbol
            }
          }

          // let liquidityDataThisToken = liquidityData?.[token.id]
          let oneDayHistory: TokenDataQuery['tokens'][number] | null = oneDayData?.[token.id]
          let twoDayHistory: TokenDataQuery['tokens'][number] | null = twoDayData?.[token.id]

          // catch the case where token wasnt in top list in previous days
          if (!oneDayHistory) {
            try {
              const oneDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
                query: TOKEN_DATA,
                errorPolicy: 'ignore',
                fetchPolicy: 'cache-first',
                variables: {
                  tokenAddress: token.id,
                  tokenAddressID: token.id,
                  block: oneDayBlock,
                },
              })
              oneDayHistory = oneDayResult.data.tokens[0]
            } catch (e) {
              console.error(e)
            }
          }
          if (!twoDayHistory) {
            try {
              const twoDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
                query: TOKEN_DATA,
                errorPolicy: 'ignore',
                fetchPolicy: 'cache-first',
                variables: {
                  tokenAddress: token.id,
                  tokenAddressID: token.id,
                  block: twoDayBlock,
                },
              })
              twoDayHistory = twoDayResult.data.tokens[0]
            } catch (e) {
              console.error(e)
            }
          }

          // calculate percentage changes and daily changes
          const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
            data.tradeVolumeUSD,
            oneDayHistory?.tradeVolumeUSD ?? '0',
            twoDayHistory?.tradeVolumeUSD ?? '0'
          )
          const [oneDayTxns, txnChange] = get2DayPercentChange(
            data.txCount,
            oneDayHistory?.txCount ?? '0',
            twoDayHistory?.txCount ?? '0'
          )

          const currentLiquidityUSD = parseFloat(data?.totalLiquidity) * parseFloat(data?.derivedCUSD)
          const oldLiquidityUSD = parseFloat(oneDayHistory?.totalLiquidity) * parseFloat(oneDayHistory?.derivedCUSD)

          // percent changes
          const priceChangeUSD = getPercentChange(data?.derivedCUSD, oneDayHistory?.derivedCUSD)

          // set data
          const additionalData = {
            priceUSD: data?.derivedCUSD,
            totalLiquidityUSD: currentLiquidityUSD,
            oneDayVolumeUSD: parseFloat(oneDayVolumeUSD.toString()),
            volumeChangeUSD: volumeChangeUSD,
            priceChangeUSD: priceChangeUSD,
            liquidityChangeUSD: getPercentChange(currentLiquidityUSD ?? 0, oldLiquidityUSD ?? 0),
            oneDayTxns: oneDayTxns,
            txnChange: txnChange,
          }

          // new tokens
          if (!oneDayHistory && data) {
            additionalData.oneDayVolumeUSD = parseFloat(data.tradeVolumeUSD)
            additionalData.oneDayTxns = parseInt(data.txCount)
          }

          // update name data for
          updateNameData({
            token0: data,
          })

          return {
            ...data,
            ...additionalData,

            // used for custom adjustments
            oneDayData: oneDayHistory,
            twoDayData: twoDayHistory,
          }
        })) ??
        []
    )

    return bulkResults

    // calculate percentage changes and daily changes
  } catch (e) {
    console.log(e)
  }
}

type TokenData = TokenDataLatestQuery['tokens'][number] &
  Partial<{
    priceUSD: number
    totalLiquidityUSD: number
    oneDayVolumeUSD: number
    volumeChangeUSD: number
    priceChangeUSD: number
    oneDayVolumeUT: number
    volumeChangeUT: number
    liquidityChangeUSD: number
    oneDayTxns: number
    txnChange: number
    oneDayData: number
    twoDayData: number
  }>

const getTokenData = async (address: string): Promise<TokenData | null> => {
  const utcCurrentTime = dayjs()
  const utcOneDayBack = utcCurrentTime.subtract(1, 'day').startOf('minute').unix()
  const utcTwoDaysBack = utcCurrentTime.subtract(2, 'day').startOf('minute').unix()
  const oneDayBlock = await getBlockFromTimestamp(utcOneDayBack)
  const twoDayBlock = await getBlockFromTimestamp(utcTwoDaysBack)

  // initialize data arrays
  let data: TokenDataLatestQuery['tokens'][number] | null = null
  let oneDayData: TokenDataLatestQuery['tokens'][number] | null = null
  let twoDayData: TokenDataLatestQuery['tokens'][number] | null = null

  try {
    // fetch all current and historical data
    const result = await client.query<TokenDataLatestQuery, TokenDataLatestQueryVariables>({
      query: TOKEN_DATA_LATEST,
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
      variables: { tokenAddress: address, tokenAddressID: address },
    })
    data = result?.data?.tokens?.[0]
    if (data) {
      const addressChecksum = isAddress(address)
      const tokenInfo = addressChecksum ? ALL_MAINNET_TOKENS_MAP[addressChecksum] : null
      if (tokenInfo) {
        data.logoURI = tokenInfo.logoURI
        data.name = tokenInfo.name
        data.symbol = tokenInfo.symbol
      }
    }

    // get results from 24 hours in past
    const oneDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
      query: TOKEN_DATA,
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
      variables: { block: oneDayBlock, tokenAddress: address, tokenAddressID: address },
    })
    oneDayData = oneDayResult.data.tokens[0]

    // get results from 48 hours in past
    const twoDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
      query: TOKEN_DATA,
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
      variables: { block: twoDayBlock, tokenAddress: address, tokenAddressID: address },
    })
    twoDayData = twoDayResult.data.tokens[0]

    // catch the case where token wasnt in top list in previous days
    if (!oneDayData) {
      const oneDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
        query: TOKEN_DATA,
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
        variables: { block: oneDayBlock, tokenAddress: address, tokenAddressID: address },
      })
      oneDayData = oneDayResult.data.tokens[0]
    }
    if (!twoDayData) {
      const twoDayResult = await client.query<TokenDataQuery, TokenDataQueryVariables>({
        query: TOKEN_DATA,
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
        variables: { block: twoDayBlock, tokenAddress: address, tokenAddressID: address },
      })
      twoDayData = twoDayResult.data.tokens[0]
    }

    // calculate percentage changes and daily changes
    const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
      data.tradeVolumeUSD,
      oneDayData?.tradeVolumeUSD,
      twoDayData?.tradeVolumeUSD
    )

    // calculate percentage changes and daily changes
    const [oneDayVolumeUT, volumeChangeUT] = get2DayPercentChange(
      data.untrackedVolumeUSD,
      oneDayData?.untrackedVolumeUSD,
      twoDayData?.untrackedVolumeUSD
    )

    // calculate percentage changes and daily changes
    const [oneDayTxns, txnChange] = get2DayPercentChange(data.txCount, oneDayData?.txCount, twoDayData?.txCount)

    const priceChangeUSD = getPercentChange(data?.derivedCUSD, oneDayData?.derivedCUSD ?? 0)

    const currentLiquidityUSD = parseFloat(data?.totalLiquidity) * parseFloat(data?.derivedCUSD)
    const oldLiquidityUSD = parseFloat(oneDayData?.totalLiquidity) * parseFloat(oneDayData?.derivedCUSD)
    const liquidityChangeUSD = getPercentChange(currentLiquidityUSD ?? 0, oldLiquidityUSD ?? 0)

    // set data
    const additionalData = {
      priceUSD: parseFloat(data?.derivedCUSD),
      totalLiquidityUSD: currentLiquidityUSD,
      oneDayVolumeUSD: oneDayVolumeUSD,
      volumeChangeUSD: volumeChangeUSD,
      priceChangeUSD: priceChangeUSD,
      oneDayVolumeUT: oneDayVolumeUT,
      volumeChangeUT: volumeChangeUT,
      liquidityChangeUSD: liquidityChangeUSD,
      oneDayTxns: oneDayTxns,
      txnChange: txnChange,

      // used for custom adjustments
      oneDayData: oneDayData?.[address],
      twoDayData: twoDayData?.[address],
    }
    // new tokens
    if (!oneDayData && data) {
      additionalData.oneDayVolumeUSD = parseFloat(data.tradeVolumeUSD)
      additionalData.oneDayTxns = parseFloat(data.txCount)
    }

    // update name data for
    updateNameData({
      token0: data,
    })
  } catch (e) {
    console.log(e)
  }
  return data
}

type TokenTransactions = Pick<FilteredTransactionsQuery, 'mints' | 'burns' | 'swaps'>

const getTokenTransactions = async (allPairsFormatted: string[]): Promise<Partial<TokenTransactions>> => {
  try {
    const result = await client.query<FilteredTransactionsQuery, FilteredTransactionsQueryVariables>({
      query: FILTERED_TRANSACTIONS,
      variables: {
        allPairs: allPairsFormatted,
      },
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
    })
    return {
      mints: result.data.mints,
      burns: result.data.burns,
      swaps: result.data.swaps,
    }
  } catch (e) {
    console.log(e)
  }

  return {}
}

const getTokenPairs = async (tokenAddress: string) => {
  try {
    // fetch all current and historical data
    const result = await client.query<TokenDataLatestQuery, TokenDataLatestQueryVariables>({
      query: TOKEN_DATA_LATEST,
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
      variables: {
        tokenAddress,
        tokenAddressID: tokenAddress,
      },
    })
    return result.data?.['pairs0'].concat(result.data?.['pairs1'])
  } catch (e) {
    console.log(e)
  }
}

const getIntervalTokenData = async (tokenAddress, startTime, interval = 3600, latestBlock) => {
  const utcEndTime = dayjs.utc()
  let time = startTime

  // create an array of hour start times until we reach current hour
  // buffer by half hour to catch case where graph isnt synced to latest block
  const timestamps = []
  while (time < utcEndTime.unix()) {
    timestamps.push(time)
    time += interval
  }

  // backout if invalid timestamp format
  if (timestamps.length === 0) {
    return []
  }

  // once you have all the timestamps, get the blocks for each timestamp in a bulk query
  let blocks
  try {
    blocks = await getBlocksFromTimestamps(timestamps, 100)

    // catch failing case
    if (!blocks || blocks.length === 0) {
      return []
    }

    if (latestBlock) {
      blocks = blocks.filter((b) => {
        return parseFloat(b.number) <= parseFloat(latestBlock)
      })
    }

    const result = await splitQuery(PRICES_BY_BLOCK, client, [tokenAddress], blocks, 50)

    // format token ETH price results
    const values = []
    for (const row in result) {
      const timestamp = row.split('t')[1]
      const derivedCUSD = parseFloat(result[row]?.derivedCUSD)
      if (timestamp) {
        values.push({
          timestamp,
          derivedCUSD,
        })
      }
    }

    // go through eth usd prices and assign to original values array
    let index = 0
    for (const brow in result) {
      const timestamp = brow.split('b')[1]
      if (timestamp) {
        values[index].priceUSD = values[index].derivedCUSD
        index += 1
      }
    }

    const formattedHistory = []

    // for each hour, construct the open and close price
    for (let i = 0; i < values.length - 1; i++) {
      formattedHistory.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].priceUSD),
        close: parseFloat(values[i + 1].priceUSD),
      })
    }

    return formattedHistory
  } catch (e) {
    console.log(e)
    console.log('error fetching blocks')
    return []
  }
}

interface TokenChartDatum {
  date: number
  dayString: string
  dailyVolumeUSD: number
  priceUSD: string
  totalLiquidityUSD: string
}

const getTokenChartData = async (tokenAddress: string): Promise<readonly TokenChartDatum[]> => {
  let fetchedData: TokenDayDatasQuery['tokenDayDatas'] = []
  let resultData: TokenChartDatum[] = []
  const utcEndTime = dayjs.utc()
  const utcStartTime = utcEndTime.subtract(1, 'year')
  const startTime = utcStartTime.startOf('minute').unix() - 1

  try {
    let allFound = false
    let skip = 0
    while (!allFound) {
      const result = await client.query<TokenDayDatasQuery, TokenDayDatasQueryVariables>({
        query: TOKEN_CHART,
        variables: {
          tokenAddr: tokenAddress,
          skip,
        },
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
      })
      if (result.data.tokenDayDatas.length < 1000) {
        allFound = true
      }
      skip += 1000
      fetchedData = fetchedData.concat(result.data.tokenDayDatas)
    }

    const dayIndexSet = new Set()
    const dayIndexArray = fetchedData.slice()
    const oneDay = 24 * 60 * 60

    resultData = fetchedData.map((dayData) => {
      dayIndexSet.add((dayData.date / oneDay).toFixed(0))
      return { ...dayData, dayString: '', dailyVolumeUSD: parseFloat(dayData.dailyVolumeUSD) }
    })

    // fill in empty days
    let timestamp = resultData[0] && resultData[0].date ? resultData[0].date : startTime
    let latestLiquidityUSD = resultData[0] && resultData[0].totalLiquidityUSD
    let latestPriceUSD = resultData[0] && resultData[0].priceUSD
    let index = 1
    while (timestamp < utcEndTime.startOf('minute').unix() - oneDay) {
      const nextDay = timestamp + oneDay
      const currentDayIndex = (nextDay / oneDay).toFixed(0)
      if (!dayIndexSet.has(currentDayIndex)) {
        resultData.push({
          date: nextDay,
          dayString: nextDay.toString(),
          dailyVolumeUSD: 0,
          priceUSD: latestPriceUSD,
          totalLiquidityUSD: latestLiquidityUSD,
        })
      } else {
        latestLiquidityUSD = dayIndexArray[index].totalLiquidityUSD
        latestPriceUSD = dayIndexArray[index].priceUSD
        index = index + 1
      }
      timestamp = nextDay
    }
    resultData = resultData.sort((a, b) => (a.date > b.date ? 1 : -1))
  } catch (e) {
    console.log(e)
  }
  return resultData
}

export function Updater() {
  const [, { updateTopTokens }] = useTokenDataContext()
  useEffect(() => {
    async function getData() {
      // get top pairs for overview list
      const topTokens = await getTopTokens()
      if (topTokens) {
        updateTopTokens(topTokens)
      }
    }
    getData()
  }, [updateTopTokens])
  return null
}

export function useTokenData(tokenAddress: string) {
  const [state, { update }] = useTokenDataContext()
  const tokenData = state?.[tokenAddress]

  useEffect(() => {
    if (!tokenData && isAddress(tokenAddress)) {
      getTokenData(tokenAddress).then((data) => {
        update(tokenAddress, data)
      })
    }
  }, [tokenAddress, tokenData, update])

  return tokenData || {}
}

export function useTokenTransactions(tokenAddress) {
  const [state, { updateTokenTxns }] = useTokenDataContext()
  const tokenTxns = state?.[tokenAddress]?.txns

  const allPairsFormatted =
    state[tokenAddress] &&
    state[tokenAddress].TOKEN_PAIRS_KEY &&
    state[tokenAddress].TOKEN_PAIRS_KEY.map((pair) => {
      return pair.id
    })

  useEffect(() => {
    async function checkForTxns() {
      if (!tokenTxns && allPairsFormatted) {
        const transactions = await getTokenTransactions(allPairsFormatted)
        updateTokenTxns(tokenAddress, transactions)
      }
    }
    checkForTxns()
  }, [tokenTxns, tokenAddress, updateTokenTxns, allPairsFormatted])

  return tokenTxns || []
}

export function useTokenPairs(tokenAddress) {
  const [state, { updateAllPairs }] = useTokenDataContext()
  const tokenPairs = state?.[tokenAddress]?.[TOKEN_PAIRS_KEY]

  useEffect(() => {
    async function fetchData() {
      const allPairs = await getTokenPairs(tokenAddress)
      updateAllPairs(tokenAddress, allPairs)
    }
    if (!tokenPairs && isAddress(tokenAddress)) {
      fetchData()
    }
  }, [tokenAddress, tokenPairs, updateAllPairs])

  return tokenPairs || []
}

export function useTokenDataCombined(tokenAddresses: readonly string[]) {
  const [state, { updateCombinedVolume }] = useTokenDataContext()

  const volume = state?.combinedVol

  useEffect(() => {
    async function fetchDatas() {
      Promise.all(
        tokenAddresses.map(async (address) => {
          return await getTokenData(address)
        })
      )
        .then((res) => {
          if (res) {
            const newVolume = res
              ? res?.reduce(function (acc, entry) {
                  acc = acc + parseFloat(entry.oneDayVolumeUSD.toString())
                  return acc
                }, 0)
              : 0
            updateCombinedVolume(newVolume)
          }
        })
        .catch(() => {
          console.log('error fetching combined data')
        })
    }
    if (!volume) {
      fetchDatas()
    }
  }, [tokenAddresses, volume, updateCombinedVolume])

  return volume
}

export function useTokenChartDataCombined(tokenAddresses) {
  const [state, { updateChartData }] = useTokenDataContext()

  const datas = useMemo(() => {
    return (
      tokenAddresses &&
      tokenAddresses.reduce(function (acc, address) {
        acc[address] = state?.[address]?.chartData
        return acc
      }, {})
    )
  }, [state, tokenAddresses])

  const isMissingData = useMemo(() => Object.values(datas).filter((val) => !val).length > 0, [datas])

  const formattedByDate = useMemo(() => {
    return (
      datas &&
      !isMissingData &&
      Object.keys(datas).map(function (address) {
        const dayDatas = datas[address]
        return dayDatas?.reduce(function (acc, dayData) {
          acc[dayData.date] = dayData
          return acc
        }, {})
      }, {})
    )
  }, [datas, isMissingData])

  useEffect(() => {
    async function fetchDatas() {
      Promise.all(
        tokenAddresses.map(async (address) => {
          return await getTokenChartData(address)
        })
      )
        .then((res) => {
          res &&
            res.map((result, i) => {
              const tokenAddress = tokenAddresses[i]
              updateChartData(tokenAddress, result)
              return true
            })
        })
        .catch(() => {
          console.log('error fetching combined data')
        })
    }
    if (isMissingData) {
      fetchDatas()
    }
  }, [isMissingData, tokenAddresses, updateChartData])

  return formattedByDate
}

export function useTokenChartData(tokenAddress) {
  const [state, { updateChartData }] = useTokenDataContext()
  const chartData = state?.[tokenAddress]?.chartData
  useEffect(() => {
    async function checkForChartData() {
      if (!chartData) {
        const data = await getTokenChartData(tokenAddress)
        updateChartData(tokenAddress, data)
      }
    }
    checkForChartData()
  }, [chartData, tokenAddress, updateChartData])
  return chartData
}

/**
 * get candlestick data for a token - saves in context based on the window and the
 * interval size
 * @param {*} tokenAddress
 * @param {*} timeWindow // a preset time window from constant - how far back to look
 * @param {*} interval  // the chunk size in seconds - default is 1 hour of 3600s
 */
export function useTokenPriceData(tokenAddress, timeWindow, interval = 3600) {
  const [state, { updatePriceData }] = useTokenDataContext()
  const chartData = state?.[tokenAddress]?.[timeWindow]?.[interval]
  const [latestBlock] = useLatestBlocks()

  useEffect(() => {
    const currentTime = dayjs.utc()
    const windowSize = timeWindow === timeframeOptions.MONTH ? 'month' : 'week'
    const startTime =
      timeWindow === timeframeOptions.ALL_TIME
        ? currentTime.subtract(3, 'month').startOf('hour').unix()
        : currentTime.subtract(1, windowSize).startOf('hour').unix()

    async function fetch() {
      const data = await getIntervalTokenData(tokenAddress, startTime, interval, latestBlock)
      updatePriceData(tokenAddress, data, timeWindow, interval)
    }
    if (!chartData) {
      fetch()
    }
  }, [chartData, interval, timeWindow, tokenAddress, updatePriceData, latestBlock])

  return chartData
}

export function useAllTokenData() {
  const [state] = useTokenDataContext()

  // filter out for only addresses
  return Object.keys(state)
    .filter((key) => key !== 'combinedVol')
    .reduce((res, key) => {
      res[key] = state[key]
      return res
    }, {})
}
