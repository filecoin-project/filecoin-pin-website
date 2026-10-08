import { calibration, mainnet } from '@filoz/synapse-sdk'
import { decodeFunctionData, encodeFunctionResult, maxUint256, multicall3Abi, toFunctionSelector } from 'viem'

export async function prepareBrowserPage(page, { seedDirectory = true, funded = true, approved = true } = {}) {
  let remoteSdkLoads = 0
  const mockedExpiry = Math.floor(Date.now() / 1000) + 7 * 86400
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (process.env.DRIVE_TEST_WALLETCONNECT && url.pathname.includes('@walletconnect_ethereum-provider')) {
      remoteSdkLoads++
      return route.fulfill({
        contentType: 'application/javascript',
        body: `export const EthereumProvider = { init: async (options) => {
          window.__walletConnectOptions = options;
          return { ...window.ethereum, accounts: [], connect: async (options) => {
            window.__walletConnectPairing = options;
          }, disconnect: async () => { window.__walletConnectDisconnected = true; } };
        } };`,
      })
    }
    if (url.origin === new URL(process.env.DRIVE_TEST_URL || 'http://127.0.0.1:5173').origin) return route.continue()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    let body
    try {
      body = route.request().postDataJSON()
    } catch {
      return route.abort()
    }
    if (!body) return route.abort()
    const { authorized, funding } = await page.evaluate(() => ({
      authorized: Boolean(window.__driveAuthorized),
      funding: window.__driveFunding,
    }))
    const chain = url.hostname.includes('calibration') ? calibration : mainnet
    const callResult = (data) => {
      if (data.startsWith(toFunctionSelector('getProvider(uint256)')))
        return encodeFunctionResult({
          abi: chain.contracts.serviceProviderRegistry.abi,
          functionName: 'getProvider',
          result: {
            providerId: 4n,
            info: {
              serviceProvider: '0x2222222222222222222222222222222222222222',
              payee: '0x2222222222222222222222222222222222222222',
              name: 'Demo SP',
              description: '',
              isActive: true,
            },
          },
        })
      if (data.startsWith(toFunctionSelector('viewContractAddress()')))
        return encodeFunctionResult({
          abi: chain.contracts.fwss.abi,
          functionName: 'viewContractAddress',
          result: chain.contracts.fwssView.address,
        })
      if (data.startsWith(toFunctionSelector('service()')))
        return encodeFunctionResult({
          abi: chain.contracts.fwssView.abi,
          functionName: 'service',
          result: chain.contracts.fwss.address,
        })
      if (data.startsWith(toFunctionSelector('authorizationExpiry(address,address,bytes32)')))
        return `0x${(authorized ? mockedExpiry : 0).toString(16).padStart(64, '0')}`
      if (data.startsWith(toFunctionSelector('accounts(address,address)')))
        return encodeFunctionResult({
          abi: mainnet.contracts.filecoinPay.abi,
          functionName: 'accounts',
          result: [funding.funded ? 10n ** 19n : 0n, 0n, 0n, 0n],
        })
      if (data.startsWith(toFunctionSelector('operatorApprovals(address,address,address)')))
        return encodeFunctionResult({
          abi: mainnet.contracts.filecoinPay.abi,
          functionName: 'operatorApprovals',
          result: [
            funding.approved,
            funding.approved ? maxUint256 : 0n,
            funding.approved ? maxUint256 : 0n,
            0n,
            0n,
            86400n,
          ],
        })
      if (data.startsWith(toFunctionSelector('getPriceList()')))
        return encodeFunctionResult({
          abi: mainnet.contracts.fwssView.abi,
          functionName: 'getPriceList',
          result: {
            token: mainnet.contracts.usdfc.address,
            rates: {
              storagePerTibPerMonth: 1n,
              datasetFeePerMonth: 1n,
              cdnEgressPerTib: 1n,
              cacheMissEgressPerTib: 1n,
            },
            fees: {
              createDataSetFee: 1n,
              addPiecesBaseFee: 1n,
              addPiecesPerPieceFee: 1n,
              schedulePieceRemovalsFee: 1n,
              terminateFee: 1n,
            },
            lockups: {
              lifecycleReserveTarget: 1n,
              replenishThreshold: 1n,
              defaultLockupPeriod: 86400n,
              cdnLockupAmount: 0n,
              cacheMissLockupAmount: 0n,
              cdnLockupPeriod: 0n,
            },
          },
        })
      if (data.startsWith(toFunctionSelector('balanceOf(address)')))
        return `0x${(20n * 10n ** 18n).toString(16).padStart(64, '0')}`
      return `0x${'0'.repeat(64 * 10)}`
    }
    const reply = (request) => {
      let result = `0x${'0'.repeat(64 * 10)}`
      if (request.method === 'eth_getBalance') result = '0x1000000000000000000'
      if (request.method === 'eth_chainId') result = '0x13a'
      if (request.method === 'eth_blockNumber') result = '0x100'
      if (request.method === 'eth_call') {
        const data = request.params[0].data
        result = callResult(data)
        if (data.startsWith(toFunctionSelector('aggregate3((address,bool,bytes)[])'))) {
          const { args } = decodeFunctionData({ abi: multicall3Abi, data })
          result = encodeFunctionResult({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            result: args[0].map((call) => ({ success: true, returnData: callResult(call.callData) })),
          })
        }
      }
      if (request.method === 'eth_getTransactionReceipt')
        result = {
          transactionHash: request.params[0],
          transactionIndex: '0x0',
          blockHash: `0x${'b'.repeat(64)}`,
          blockNumber: '0xff',
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          cumulativeGasUsed: '0x100',
          gasUsed: '0x100',
          effectiveGasPrice: '0x1',
          contractAddress: null,
          logs: [],
          logsBloom: `0x${'0'.repeat(512)}`,
          status: '0x1',
          type: '0x2',
        }
      return { jsonrpc: '2.0', id: request.id, result }
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: JSON.stringify(Array.isArray(body) ? body.map(reply) : reply(body)),
    })
  })
  await page.addInitScript(
    ({ seedDirectory, funded, approved }) => {
      window.__driveFunding = { funded, approved }
      const address = '0x1111111111111111111111111111111111111111'
      const handlers = new Map()
      let accounts = [address]
      let chainId = '0x13a'
      window.ethereum = {
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts
          if (method === 'eth_chainId') return chainId
          if (method === 'wallet_switchEthereumChain') {
            chainId = params[0].chainId
            return null
          }
          if (method === 'eth_sendTransaction') {
            window.__driveAuthorized = true
            return `0x${'a'.repeat(64)}`
          }
          throw new Error(`Unexpected wallet method: ${method}`)
        },
        on: (name, callback) => handlers.set(name, callback),
        removeListener: (name) => handlers.delete(name),
        switchAccount: (next) => {
          accounts = [next]
          handlers.get('accountsChanged')?.(accounts)
        },
      }
      const scope = `314:${address}`
      localStorage.setItem('filecoin-pin-client-id', 'test-browser')
      if (seedDirectory && !localStorage.getItem(`filecoin-pin-piece-cache-v1-${scope}`)) {
        localStorage.setItem(`filecoin-pin-data-set-ids-v1-${scope}`, JSON.stringify([1]))
        localStorage.setItem(
          `filecoin-pin-piece-cache-v1-${scope}`,
          JSON.stringify([
            {
              id: 'demo-file',
              fileName: 'report.pdf',
              fileSize: '12 MB',
              cid: 'bafkreigh2akiscaildcgck5x5wqlooqkztdxqv5t5uwmybnv5brkw4zj3m',
              pieceCid: 'bafkzcibcd4bdomn3tgwgrh3g532zopskstnbrd2n3sxfqbze7rxt7vqn7veigmy',
              providerName: 'Demo SP',
              datasetId: '1',
              providerId: '4',
              serviceURL: '',
              transactionHash: '',
              network: 'mainnet',
              uploadedAt: Date.now(),
              pieceId: 1,
              copyCount: 1,
              folderPath: '',
              ipfsIndexed: false,
            },
          ])
        )
      }
    },
    { seedDirectory, funded, approved }
  )
  return { sdkLoads: () => remoteSdkLoads }
}
