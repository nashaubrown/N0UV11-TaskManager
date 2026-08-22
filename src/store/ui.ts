import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean          // mobile drawer
  setSidebarOpen: (open: boolean) => void
  selectedPhotoIds: string[]
  togglePhotoSelection: (id: string) => void
  clearPhotoSelection: () => void
}

export const useUi = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  selectedPhotoIds: [],
  togglePhotoSelection: (id) =>
    set((s) => ({
      selectedPhotoIds: s.selectedPhotoIds.includes(id)
        ? s.selectedPhotoIds.filter((x) => x !== id)
        : [...s.selectedPhotoIds, id],
    })),
  clearPhotoSelection: () => set({ selectedPhotoIds: [] }),
}))
