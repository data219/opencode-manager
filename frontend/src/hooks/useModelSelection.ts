import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConfig } from './useOpenCode'
import { useOpenCodeClient } from './useOpenCode'
import { useModelStore, type ModelSelection } from '@/stores/modelStore'
import { getProvidersWithModels, type Provider } from '@/api/providers'

interface UseModelSelectionResult {
  model: ModelSelection | null
  modelString: string | null
  recentModels: ModelSelection[]
  setModel: (model: ModelSelection) => void
}

export function useModelSelection(
  opcodeUrl: string | null | undefined,
  directory?: string
): UseModelSelectionResult {
  const { data: config } = useConfig(opcodeUrl, directory)
  const client = useOpenCodeClient(opcodeUrl, directory)
  
  const { data: providersData } = useQuery({
    queryKey: ['opencode', 'providers', opcodeUrl, directory],
    queryFn: async () => {
      const providers = await getProvidersWithModels()
      const normalizedProviders: Provider[] = providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        api: provider.api,
        env: provider.env,
        npm: provider.npm,
        options: undefined,
        source: provider.source,
        isConnected: provider.isConnected,
        models: Object.fromEntries(
          provider.models.map((model) => [
            model.key || model.id,
            model,
          ])
        ),
      }))

      return {
        providers: normalizedProviders,
        connected: normalizedProviders
          .filter((provider) => provider.isConnected)
          .map((provider) => provider.id),
      }
    },
    enabled: !!client,
    staleTime: 30000,
  })

  const { 
    model, 
    recentModels, 
    setModel, 
    validateAndSyncModel, 
    getModelString 
  } = useModelStore()

  useEffect(() => {
    validateAndSyncModel(config?.model, providersData?.providers)
  }, [config?.model, providersData, validateAndSyncModel])

  return {
    model,
    modelString: getModelString(),
    recentModels,
    setModel,
  }
}
