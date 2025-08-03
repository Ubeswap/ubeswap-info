import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'

import { client } from '../apollo/client'
import {
  FilteredTransactionsQuery,
  FilteredTransactionsQueryVariables,
  PairDataQuery,
  PairDataQueryVariables,
  PairFieldsFragment,
  PairsBulkQuery,
  PairsBulkQueryVariables,
  PairsHistoricalBulkQuery,
  PairsHistoricalBulkQueryVariables,
} from '../apollo/generated/types'
import {
  FILTERED_TRANSACTIONS,
  HOURLY_PAIR_RATES,
  PAIR_CHART,
  PAIR_DATA,
  PAIRS_BULK,
  PAIRS_CURRENT,
  PAIRS_HISTORICAL_BULK,
} from '../apollo/queries'
import { timeframeOptions } from '../constants'
import {
  get2DayPercentChange,
  getBlocksFromTimestamps,
  getPercentChange,
  getTimestampsForChanges,
  isAddress,
  splitQuery,
} from '../utils'
import { updateNameData } from '../utils/data'
import { toFloat, toInt } from '../utils/typeAssertions'
import { useLatestBlocks } from './Application'

const UPDATE = 'UPDATE'
const UPDATE_PAIR_TXNS = 'UPDATE_PAIR_TXNS'
const UPDATE_CHART_DATA = 'UPDATE_CHART_DATA'
const UPDATE_TOP_PAIRS = 'UPDATE_TOP_PAIRS'
const UPDATE_HOURLY_DATA = 'UPDATE_HOURLY_DATA'

dayjs.extend(utc)

export function safeAccess(object, path) {
  return object
    ? path.reduce(
        (accumulator, currentValue) => (accumulator && accumulator[currentValue] ? accumulator[currentValue] : null),
        object
      )
    : null
}

const PairDataContext = createContext(undefined)

function usePairDataContext() {
  return useContext(PairDataContext)
}

function reducer(state, { type, payload }) {
  switch (type) {
    case UPDATE: {
      const { pairAddress, data } = payload
      return {
        ...state,
        [pairAddress]: {
          ...state?.[pairAddress],
          ...data,
        },
      }
    }

    case UPDATE_TOP_PAIRS: {
      const { topPairs } = payload
      const added = {}
      topPairs.map((pair) => {
        return (added[pair.id] = pair)
      })
      return {
        ...state,
        ...added,
      }
    }

    case UPDATE_PAIR_TXNS: {
      const { address, transactions } = payload
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          txns: transactions,
        },
      }
    }
    case UPDATE_CHART_DATA: {
      const { address, chartData } = payload
      return {
        ...state,
        [address]: {
          ...(safeAccess(state, [address]) || {}),
          chartData,
        },
      }
    }

    case UPDATE_HOURLY_DATA: {
      const { address, hourlyData, timeWindow } = payload
      return {
        ...state,
        [address]: {
          ...state?.[address],
          hourlyData: {
            ...state?.[address]?.hourlyData,
            [timeWindow]: hourlyData,
          },
        },
      }
    }

    default: {
      throw Error(`Unexpected action type in DataContext reducer: '${type}'.`)
    }
  }
}

export default function Provider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {})

  // update pair specific data
  const update = useCallback((pairAddress, data) => {
    dispatch({
      type: UPDATE,
      payload: {
        pairAddress,
        data,
      },
    })
  }, [])

  const updateTopPairs = useCallback((topPairs) => {
    dispatch({
      type: UPDATE_TOP_PAIRS,
      payload: {
        topPairs,
      },
    })
  }, [])

  const updatePairTxns = useCallback((address, transactions) => {
    dispatch({
      type: UPDATE_PAIR_TXNS,
      payload: { address, transactions },
    })
  }, [])

  const updateChartData = useCallback((address, chartData) => {
    dispatch({
      type: UPDATE_CHART_DATA,
      payload: { address, chartData },
    })
  }, [])

  const updateHourlyData = useCallback((address, hourlyData, timeWindow) => {
    dispatch({
      type: UPDATE_HOURLY_DATA,
      payload: { address, hourlyData, timeWindow },
    })
  }, [])

  return (
    <PairDataContext.Provider
      value={useMemo(
        () => [
          state,
          {
            update,
            updatePairTxns,
            updateChartData,
            updateTopPairs,
            updateHourlyData,
          },
        ],
        [state, update, updatePairTxns, updateChartData, updateTopPairs, updateHourlyData]
      )}
    >
      {children}
    </PairDataContext.Provider>
  )
}

async function getBulkPairData(pairList) {
  const [t1, t2, tWeek] = getTimestampsForChanges()
  const [{ number: b1 }, { number: b2 }, { number: bWeek }] = await getBlocksFromTimestamps([t1, t2, tWeek])

  try {
    const current = await client.query<PairsBulkQuery, PairsBulkQueryVariables>({
      query: PAIRS_BULK,
      variables: {
        allPairs: pairList,
      },
      errorPolicy: 'ignore',
      fetchPolicy: 'cache-first',
    })

    const [oneDayResult, twoDayResult, oneWeekResult] = await Promise.all(
      [b1, b2, bWeek].map(async (block) => {
        try {
          const { data } = await client.query<PairsHistoricalBulkQuery, PairsHistoricalBulkQueryVariables>({
            query: PAIRS_HISTORICAL_BULK,
            errorPolicy: 'ignore',
            fetchPolicy: 'cache-first',
            variables: {
              block,
              pairs: pairList,
            },
          })
          return data.pairs ?? []
        } catch (e) {
          console.error(e)
          return []
        }
      })
    )

    const oneDayData = oneDayResult.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur }
    }, {})

    const twoDayData = twoDayResult.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur }
    }, {})

    const oneWeekData = oneWeekResult.reduce((obj, cur) => {
      return { ...obj, [cur.id]: cur }
    }, {})

    const pairData = await Promise.all(
      current.data.pairs.map(async (pair) => {
        let oneDayHistory: PairFieldsFragment | undefined = oneDayData?.[pair.id]
        if (!oneDayHistory) {
          try {
            const newData = await client.query<PairDataQuery, PairDataQueryVariables>({
              query: PAIR_DATA,
              errorPolicy: 'ignore',
              fetchPolicy: 'cache-first',
              variables: {
                pairAddress: pair.id,
                block: b1,
              },
            })
            oneDayHistory = newData.data.pairs[0]
          } catch (e) {
            console.error(e)
          }
        }
        let twoDayHistory: PairFieldsFragment | undefined = twoDayData?.[pair.id]
        if (!twoDayHistory) {
          try {
            const newData = await client.query<PairDataQuery, PairDataQueryVariables>({
              query: PAIR_DATA,
              errorPolicy: 'ignore',
              fetchPolicy: 'cache-first',
              variables: {
                pairAddress: pair.id,
                block: b2,
              },
            })
            twoDayHistory = newData.data.pairs[0]
          } catch (e) {
            console.error(e)
          }
        }
        let oneWeekHistory: PairFieldsFragment | undefined = oneWeekData?.[pair.id]
        if (!oneWeekHistory) {
          try {
            const newData = await client.query<PairDataQuery, PairDataQueryVariables>({
              query: PAIR_DATA,
              errorPolicy: 'ignore',
              fetchPolicy: 'cache-first',
              variables: {
                pairAddress: pair.id,
                block: bWeek,
              },
            })
            oneWeekHistory = newData.data.pairs[0]
          } catch (e) {
            console.error(e)
          }
        }
        return parseData(pair, oneDayHistory, twoDayHistory, oneWeekHistory, b1)
      })
    )
    return pairData
  } catch (e) {
    console.log(e)
  }
}

function parseData(
  data: PairFieldsFragment,
  oneDayData?: PairFieldsFragment,
  twoDayData?: PairFieldsFragment,
  oneWeekData?: PairFieldsFragment,
  oneDayBlock?: number
) {
  // get volume changes
  const [oneDayVolumeUSD, volumeChangeUSD] = get2DayPercentChange(
    data?.volumeUSD,
    oneDayData?.volumeUSD ? oneDayData.volumeUSD : '0',
    twoDayData?.volumeUSD ? twoDayData.volumeUSD : '0'
  )
  const [oneDayVolumeUntracked, volumeChangeUntracked] = get2DayPercentChange(
    data?.untrackedVolumeUSD,
    oneDayData?.untrackedVolumeUSD ? oneDayData?.untrackedVolumeUSD : '0',
    twoDayData?.untrackedVolumeUSD ? twoDayData?.untrackedVolumeUSD : '0'
  )

  const oneWeekVolumeUSD = oneWeekData
    ? toFloat(data?.volumeUSD) - toFloat(oneWeekData?.volumeUSD)
    : toFloat(data.volumeUSD)

  const oneWeekVolumeUntracked = oneWeekData
    ? toFloat(data?.untrackedVolumeUSD) - toFloat(oneWeekData?.untrackedVolumeUSD)
    : toFloat(data.untrackedVolumeUSD)

  const otherProperties = {
    // set volume properties
    oneDayVolumeUSD: parseFloat(oneDayVolumeUSD.toString()),
    oneWeekVolumeUSD: oneWeekVolumeUSD,
    volumeChangeUSD: volumeChangeUSD,
    oneDayVolumeUntracked: oneDayVolumeUntracked,
    oneWeekVolumeUntracked: oneWeekVolumeUntracked,
    volumeChangeUntracked: volumeChangeUntracked,

    // set liquidity properties
    trackedReserveUSD: data.trackedReserveUSD,
    liquidityChangeUSD: getPercentChange(data.reserveUSD, oneDayData?.reserveUSD),
  }

  // format if pair hasnt existed for a day or a week
  if (!oneDayData && data && toInt(data.createdAtBlockNumber) > oneDayBlock) {
    otherProperties.oneDayVolumeUSD = parseFloat(data.volumeUSD)
  }
  if (!oneDayData && data) {
    otherProperties.oneDayVolumeUSD = parseFloat(data.volumeUSD)
  }
  if (!oneWeekData && data) {
    otherProperties.oneWeekVolumeUSD = parseFloat(data.volumeUSD)
  }

  const result = { ...data, ...otherProperties }
  // format incorrect names
  updateNameData(result)
  return result
}

const getPairTransactions = async (pairAddress: string) => {
  const transactions = {}

  try {
    const result = await client.query<FilteredTransactionsQuery, FilteredTransactionsQueryVariables>({
      query: FILTERED_TRANSACTIONS,
      variables: {
        allPairs: [pairAddress],
      },
      errorPolicy: 'ignore',
      fetchPolicy: 'no-cache',
    })
    return {
      mints: result.data.mints,
      burns: result.data.burns,
      swaps: result.data.swaps,
    }
  } catch (e) {
    console.log(e)
  }

  return transactions
}

const getPairChartData = async (pairAddress) => {
  let data = []
  const utcEndTime = dayjs.utc()
  const utcStartTime = utcEndTime.subtract(1, 'year').startOf('minute')
  const startTime = utcStartTime.unix() - 1

  try {
    let allFound = false
    let skip = 0
    while (!allFound) {
      const result = await client.query({
        query: PAIR_CHART,
        variables: {
          pairAddress: pairAddress,
          skip,
        },
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
      })
      skip += 1000
      data = data.concat(result.data.pairDayDatas)
      if (result.data.pairDayDatas.length < 1000) {
        allFound = true
      }
    }

    const dayIndexSet = new Set()
    const dayIndexArray = []
    const oneDay = 24 * 60 * 60
    data.forEach((dayData, i) => {
      // add the day index to the set of days
      dayIndexSet.add((data[i].date / oneDay).toFixed(0))
      dayIndexArray.push(data[i])
      dayData.dailyVolumeUSD = parseFloat(dayData.dailyVolumeUSD)
      dayData.reserveUSD = parseFloat(dayData.reserveUSD)
    })

    if (data[0]) {
      // fill in empty days
      let timestamp = data[0].date ? data[0].date : startTime
      let latestLiquidityUSD = data[0].reserveUSD
      let index = 1
      while (timestamp < utcEndTime.unix() - oneDay) {
        const nextDay = timestamp + oneDay
        const currentDayIndex = (nextDay / oneDay).toFixed(0)
        if (!dayIndexSet.has(currentDayIndex)) {
          data.push({
            date: nextDay,
            dayString: nextDay,
            dailyVolumeUSD: 0,
            reserveUSD: latestLiquidityUSD,
          })
        } else {
          latestLiquidityUSD = dayIndexArray[index].reserveUSD
          index = index + 1
        }
        timestamp = nextDay
      }
    }

    data = data.sort((a, b) => (parseInt(a.date) > parseInt(b.date) ? 1 : -1))
  } catch (e) {
    console.log(e)
  }

  return data
}

const getHourlyRateData = async (pairAddress, startTime, latestBlock) => {
  try {
    const utcEndTime = dayjs.utc()
    let time = startTime

    // create an array of hour start times until we reach current hour
    const timestamps = []
    while (time <= utcEndTime.unix() - 3600) {
      timestamps.push(time)
      time += 3600
    }

    // backout if invalid timestamp format
    if (timestamps.length === 0) {
      return []
    }

    // once you have all the timestamps, get the blocks for each timestamp in a bulk query
    let blocks

    blocks = await getBlocksFromTimestamps(timestamps, 100)

    // catch failing case
    if (!blocks || blocks?.length === 0) {
      return []
    }

    if (latestBlock) {
      blocks = blocks.filter((b) => {
        return parseFloat(b.number) <= parseFloat(latestBlock)
      })
    }

    const result = await splitQuery(HOURLY_PAIR_RATES, client, [pairAddress], blocks, 100)

    // format token ETH price results
    const values = []
    for (const row in result) {
      const timestamp = row.split('t')[1]
      if (timestamp) {
        values.push({
          timestamp,
          rate0: parseFloat(result[row]?.token0Price),
          rate1: parseFloat(result[row]?.token1Price),
        })
      }
    }

    const formattedHistoryRate0 = []
    const formattedHistoryRate1 = []

    // for each hour, construct the open and close price
    for (let i = 0; i < values.length - 1; i++) {
      formattedHistoryRate0.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].rate0),
        close: parseFloat(values[i + 1].rate0),
      })
      formattedHistoryRate1.push({
        timestamp: values[i].timestamp,
        open: parseFloat(values[i].rate1),
        close: parseFloat(values[i + 1].rate1),
      })
    }

    return [formattedHistoryRate0, formattedHistoryRate1]
  } catch (e) {
    console.log(e)
    return [[], []]
  }
}

export function Updater(): null {
  const [, { updateTopPairs }] = usePairDataContext()
  useEffect(() => {
    async function getData() {
      // get top pairs by reserves
      const {
        data: { pairs },
      } = await client.query({
        query: PAIRS_CURRENT,
        errorPolicy: 'ignore',
        fetchPolicy: 'cache-first',
      })

      // format as array of addresses
      const formattedPairs = pairs.map((pair) => {
        return pair.id
      })

      // get data for every pair in list
      const topPairs = await getBulkPairData(formattedPairs)
      topPairs && updateTopPairs(topPairs)
    }
    getData()
  }, [updateTopPairs])
  return null
}

export function useHourlyRateData(pairAddress: string, timeWindow) {
  const [state, { updateHourlyData }] = usePairDataContext()
  const chartData = state?.[pairAddress]?.hourlyData?.[timeWindow]
  const [latestBlock] = useLatestBlocks()

  useEffect(() => {
    const currentTime = dayjs.utc()
    const windowSize = timeWindow === timeframeOptions.MONTH ? 'month' : 'week'
    const startTime =
      timeWindow === timeframeOptions.ALL_TIME
        ? currentTime.subtract(3, 'month').startOf('hour').unix()
        : currentTime.subtract(1, windowSize).startOf('hour').unix()

    async function fetch() {
      const data = await getHourlyRateData(pairAddress, startTime, latestBlock)
      updateHourlyData(pairAddress, data, timeWindow)
    }
    if (!chartData) {
      fetch()
    }
  }, [chartData, timeWindow, pairAddress, updateHourlyData, latestBlock])

  return chartData
}

/**
 * @todo
 * store these updates to reduce future redundant calls
 */
export function useDataForList(pairList) {
  const [state] = usePairDataContext()

  const [stale, setStale] = useState(false)
  const [fetched, setFetched] = useState<Record<string, unknown>[] | undefined>([])

  // reset
  useEffect(() => {
    if (pairList) {
      setStale(false)
      setFetched(undefined)
    }
  }, [pairList])

  useEffect(() => {
    async function fetchNewPairData() {
      const newFetched = []
      const unfetched = []

      pairList.map(async (pair) => {
        const currentData = state?.[pair.id]
        if (!currentData) {
          unfetched.push(pair.id)
        } else {
          newFetched.push(currentData)
        }
      })

      const newPairData = await getBulkPairData(
        unfetched.map((pair) => {
          return pair
        })
      )
      setFetched(newFetched.concat(newPairData))
    }
    if (pairList && pairList.length > 0 && !fetched && !stale) {
      setStale(true)
      fetchNewPairData()
    }
  }, [state, pairList, stale, fetched])

  const formattedFetch =
    fetched &&
    fetched.reduce((obj, cur) => {
      return { ...obj, [cur?.id as string]: cur }
    }, {})

  return formattedFetch
}

/**
 * Get all the current and 24hr changes for a pair
 */
export function usePairData(pairAddress) {
  const [state, { update }] = usePairDataContext()
  const pairData = state?.[pairAddress]

  useEffect(() => {
    async function fetchData() {
      if (!pairData && pairAddress) {
        const data = await getBulkPairData([pairAddress])
        data && update(pairAddress, data[0])
      }
    }
    if (!pairData && pairAddress && isAddress(pairAddress)) {
      fetchData()
    }
  }, [pairAddress, pairData, update])

  return pairData || {}
}

/**
 * Get most recent txns for a pair
 */
export function usePairTransactions(pairAddress) {
  const [state, { updatePairTxns }] = usePairDataContext()
  const pairTxns = state?.[pairAddress]?.txns
  useEffect(() => {
    async function checkForTxns() {
      if (!pairTxns) {
        const transactions = await getPairTransactions(pairAddress)
        updatePairTxns(pairAddress, transactions)
      }
    }
    checkForTxns()
  }, [pairTxns, pairAddress, updatePairTxns])
  return pairTxns
}

export function usePairChartData(pairAddress) {
  const [state, { updateChartData }] = usePairDataContext()
  const chartData = state?.[pairAddress]?.chartData

  useEffect(() => {
    async function checkForChartData() {
      if (!chartData) {
        const data = await getPairChartData(pairAddress)
        updateChartData(pairAddress, data)
      }
    }
    checkForChartData()
  }, [chartData, pairAddress, updateChartData])
  return chartData
}

/**
 * Get list of all pairs in Ubeswap
 */
export function useAllPairData() {
  const [state] = usePairDataContext()
  return state ?? {}
}
