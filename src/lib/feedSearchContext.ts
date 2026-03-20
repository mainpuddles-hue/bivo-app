import { createContext, useContext } from 'react'

interface FeedSearchContextType {
  onSearchPress?: () => void
  _setHandler?: (handler: (() => void) | undefined) => void
}

export const FeedSearchContext = createContext<FeedSearchContextType>({})
export const useFeedSearch = () => useContext(FeedSearchContext)
