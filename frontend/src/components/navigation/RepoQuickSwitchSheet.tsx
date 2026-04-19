import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { BottomSheet, BottomSheetHeader, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { getRepoDisplayName } from '@/lib/utils'
import { listRepos } from '@/api/repos'

interface RepoQuickSwitchSheetProps {
  isOpen: boolean
  onClose: () => void
}

export function RepoQuickSwitchSheet({ isOpen, onClose }: RepoQuickSwitchSheetProps) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: listRepos,
    enabled: isOpen,
  })

  const filteredRepos = useMemo(() => {
    if (!repos) return []
    const sorted = [...repos].sort((a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0))
    if (!searchQuery.trim()) return sorted
    const query = searchQuery.toLowerCase()
    return sorted.filter((repo) =>
      getRepoDisplayName(repo.repoUrl, repo.localPath, repo.sourcePath).toLowerCase().includes(query)
    )
  }, [repos, searchQuery])

  const handleClick = (id: number) => {
    navigate(`/repos/${id}`)
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} heightClass="h-[70dvh]" ariaLabel="Switch repo">
      <BottomSheetHeader title="Switch repo" />
      <BottomSheetContent className="flex flex-col gap-2 overflow-y-auto">
        <Input
          type="text"
          placeholder="Search repos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="flex-shrink-0"
        />
        {isLoading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No repos found
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredRepos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => handleClick(repo.id)}
                className="flex items-center px-2 py-2 rounded-md hover:bg-accent transition-colors text-left text-sm text-foreground truncate w-full"
              >
                {getRepoDisplayName(repo.repoUrl, repo.localPath, repo.sourcePath)}
              </button>
            ))}
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  )
}
