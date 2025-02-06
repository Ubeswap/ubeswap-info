import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloClient } from 'apollo-client'
import { HttpLink } from 'apollo-link-http'

export const client = new ApolloClient({
  link: new HttpLink({
    uri: 'https://interface-gateway.ubeswap.org/v1/v2-subgraph-proxy',
  }),
  cache: new InMemoryCache(),
})

export const healthClient = new ApolloClient({
  link: new HttpLink({
    uri: 'https://api.thegraph.com/index-node/graphql',
  }),
  cache: new InMemoryCache(),
})

export const blockClient = new ApolloClient({
  link: new HttpLink({
    uri: 'https://gateway-arbitrum.network.thegraph.com/api/3f1b45f0fd92b4f414a3158b0381f482/subgraphs/id/5Uhq8XrBsxdRwMKBNXcp4GuHp1SRmqPK5hgCCMqxDxhB',
  }),
  cache: new InMemoryCache(),
})
