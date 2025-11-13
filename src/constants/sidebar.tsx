const FILECOIN_PIN_REPO_URL = 'https://github.com/filecoin-project/filecoin-pin'
const DOCUMENTATION_BASE_URL = `${FILECOIN_PIN_REPO_URL}/blob/master/documentation`
const GLOSSARY_BASE_URL = `${DOCUMENTATION_BASE_URL}/glossary.md`

export const SIDEBAR_CONFIG = {
  documentation: {
    car: `${GLOSSARY_BASE_URL}#car`,
    filecoinPay: `${GLOSSARY_BASE_URL}#filecoin-pay`,
    filecoinPinLearnMore: `${DOCUMENTATION_BASE_URL}/behind-the-scenes-of-adding-a-file.md`,
    filecoinWarmStorageService: `${DOCUMENTATION_BASE_URL}/filecoin-warm-storage-service.md`,
    ipni: `${GLOSSARY_BASE_URL}#ipni`,
    pieceCid: `${GLOSSARY_BASE_URL}#piece-cid`,
    serviceProvider: `${GLOSSARY_BASE_URL}#service-provider`,
    standardIpfsTooling: `${GLOSSARY_BASE_URL}#standard-ipfs-tooling`,
  },
  github: {
    cli: FILECOIN_PIN_REPO_URL,
    cloneDemo: 'https://github.com/filecoin-project/filecoin-pin-website/fork',
    githubAction: `${FILECOIN_PIN_REPO_URL}/tree/master/upload-action`,
  },
} as const
