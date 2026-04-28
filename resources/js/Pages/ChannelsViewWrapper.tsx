import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useWorkspace } from '../hooks/useWorkspace'
import { ChannelsView } from './ChannelsView'
import type { ChannelAttachment } from './ChannelsView'
import { api, extractErrorMessage } from '../lib/api'
import { effectivePresenceSlug } from '../components/ui'

export function ChannelsViewWrapper() {
  const {
    channels, setChannels, selectedChannelId, setSelectedChannelId,
    selectedThreadId, setSelectedThreadId,
    selectedChannel, channelMembers, messages, setMessages,
    threadParent, threadReplies, setThreadReplies,
    channelStatus, setChannelStatus,
    refreshChannel,
    currentUser, typingUsers, sendTyping,
    presence, loadOverview,
    programs, workGroups,
  } = useWorkspace()

  const allTasks = useMemo(() => workGroups.flatMap((g) => g.items), [workGroups])

  // All workspace users from presence (used for DM picker + lookup)
  const workspaceUsers = useMemo(() => {
    return presence
      .filter((p) => p.user)
      .map((p) => ({ id: p.userId, name: p.user!.name, roleType: p.user!.roleType }))
  }, [presence])

  // Set of user IDs showing as green (truly active) — for DM presence dots
  const onlineUserIds = useMemo(() => {
    const s = new Set<number>()
    presence.forEach((p) => {
      const slug = effectivePresenceSlug(p.status, p.lastActivityAt)
      if (slug === 'online') s.add(p.userId)
    })
    return s
  }, [presence])

  // Effective slug map — used for message avatar presence dots
  const presenceStatusMap = useMemo(() => {
    const m = new Map<number, string>()
    presence.forEach((p) => {
      const slug = effectivePresenceSlug(p.status, p.lastActivityAt)
      if (slug !== 'offline') m.set(p.userId, slug)
    })
    return m
  }, [presence])

  // DM partner's presence detail (status + lastActivityAt) for last-seen display
  const dmPartnerPresence = useMemo(() => {
    if (!selectedChannel) return null
    const match = selectedChannel.name.match(/^dm-(\d+)-(\d+)$/)
    if (!match) return null
    const currentId = currentUser?.id ?? null
    const partnerId = Number(match[1]) === currentId ? Number(match[2]) : Number(match[1])
    const p = presence.find(u => u.userId === partnerId)
    return p ? { status: p.status, lastActivityAt: p.lastActivityAt } : null
  }, [selectedChannel, presence, currentUser])

  // Users not already in the current channel — for "add member" search
  const addableUsers = useMemo(() => {
    const memberIds = new Set(channelMembers.map((m) => m.userId))
    return workspaceUsers.filter((u) => !memberIds.has(u.id))
  }, [workspaceUsers, channelMembers])

  const [composerValue, setComposerValue] = useState('')
  const [sending, setSending] = useState(false)
  const prevChannelRef = useRef<number | null>(null)

  // ── Per-channel drafts ────────────────────────────────────
  useEffect(() => {
    const prev = prevChannelRef.current
    if (prev === selectedChannelId) return
    // Save departing channel's draft
    if (prev !== null) {
      const v = composerValue.trim()
      if (v) localStorage.setItem(`atlas.draft.${prev}`, v)
      else localStorage.removeItem(`atlas.draft.${prev}`)
    }
    // Restore arriving channel's draft
    if (selectedChannelId !== null) {
      const saved = localStorage.getItem(`atlas.draft.${selectedChannelId}`) ?? ''
      setComposerValue(saved)
    } else {
      setComposerValue('')
    }
    prevChannelRef.current = selectedChannelId
  }, [selectedChannelId])

  // Unread count captured at channel-entry time (before optimistic mark-as-read clears it)
  const [channelEntryUnread, setChannelEntryUnread] = useState(0)

  // Saved messages — bookmark IDs for current user
  const [savedMessageIds, setSavedMessageIds] = useState<Set<number>>(new Set())
  // Channel mute state — local lookup of muted channel IDs
  const [mutedChannelIds, setMutedChannelIds] = useState<Set<number>>(new Set())

  // Load saved message IDs on mount
  useEffect(() => {
    if (!currentUser) return
    void (async () => {
      try {
        const result = await api.get<{ data: Array<{ id: number }> }>('/saved-messages')
        setSavedMessageIds(new Set(result.data.map((m) => m.id)))
      } catch { /* noop */ }
    })()
  }, [currentUser])

  // Sync muted state from channelMembers (when admin opens a channel, isMuted comes back)
  useEffect(() => {
    if (!currentUser) return
    const me = channelMembers.find((m) => m.userId === currentUser.id)
    if (me && selectedChannelId) {
      // ChannelMember type doesn't expose isMuted by default — gate via type assertion
      const isMuted = (me as { isMuted?: boolean }).isMuted ?? false
      setMutedChannelIds((prev) => {
        const next = new Set(prev)
        if (isMuted) next.add(selectedChannelId); else next.delete(selectedChannelId)
        return next
      })
    }
  }, [channelMembers, currentUser, selectedChannelId])

  const channelTypingUsers = selectedChannelId
    ? (typingUsers[selectedChannelId] ?? []).filter((u) => u.userId !== currentUser?.id)
    : []

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>, attachments?: ChannelAttachment[]) => {
    event.preventDefault()
    const content = composerValue.trim()
    if (!selectedChannelId || !currentUser) return
    if (!content && (!attachments || attachments.length === 0)) return
    setSending(true)
    setComposerValue('')
    const channelId = selectedChannelId
    const threadId = selectedThreadId
    try {
      const result = await api.post<{ data: { id: number; createdAt?: string } }>(`/channels/${channelId}/messages`, {
        content: content || ' ',
        parentMessageId: threadId ?? undefined,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      })

      // Optimistic insert — don't wait for SSE (survives SSE drop / self-broadcast issues)
      const optimistic = {
        id: result.data.id,
        channelId,
        userId: currentUser.id,
        content: content || ' ',
        replyCount: 0,
        reactions: {} as Record<string, number[]>,
        isPinned: false,
        isEdited: false,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
        parentMessageId: threadId ?? undefined,
        createdAt: result.data.createdAt ?? new Date().toISOString(),
        updatedAt: result.data.createdAt ?? new Date().toISOString(),
        authorName: currentUser.name,
        authorRole: currentUser.roleType,
      }

      if (threadId) {
        // Reply to thread — append to thread replies, bump parent count
        setThreadReplies((prev) => prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic])
        setMessages((prev) => prev.map((m) =>
          m.id === threadId ? { ...m, replyCount: m.replyCount + 1 } : m
        ))
      } else {
        // Top-level message — append to main stream
        setMessages((prev) => prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic])
      }
    } catch (err) {
      setComposerValue(content)
      const msg = err instanceof Error ? err.message : 'Pesan gagal dikirim. Coba lagi.'
      setChannelStatus({ loading: false, message: msg })
      console.error('[sendMessage] failed:', err)
    } finally {
      setSending(false)
    }
  }

  const handleUploadFiles = async (formData: FormData): Promise<ChannelAttachment[]> => {
    // Note: api.post stringifies JSON. For multipart we use raw fetch.
    const res = await fetch('/uploads', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      let msg = `Upload failed (${res.status})`
      try {
        const body = await res.json() as { error?: string }
        if (body.error) msg = body.error
      } catch { /* noop */ }
      throw new Error(msg)
    }
    const json = await res.json() as { data: ChannelAttachment[] }
    return json.data
  }

  const handleReactEmoji = (messageId: number, emoji: string) => {
    if (!selectedChannelId) return
    // Fire-and-forget — SSE reaction:changed event updates state
    void api.post(`/channels/${selectedChannelId}/messages/${messageId}/reactions`, { emoji })
  }

  const handleEditMessage = async (messageId: number, content: string) => {
    if (!selectedChannelId) return
    await api.put(`/channels/${selectedChannelId}/messages/${messageId}`, { content })
    // SSE message:updated will update state automatically
  }

  const handleDeleteMessage = async (messageId: number, scope: 'self' | 'all') => {
    if (!selectedChannelId) return
    try {
      await api.delete(`/channels/${selectedChannelId}/messages/${messageId}`, { scope })
      if (scope === 'self' && selectedThreadId === messageId) {
        setSelectedThreadId(null)
      }
      void loadOverview('refresh')
      // SSE message:deleted will update state automatically
    } catch (err) {
      const msg = extractErrorMessage(
        err,
        scope === 'all'
          ? 'Pesan gagal dihapus untuk semua anggota.'
          : 'Pesan gagal dihapus dari tampilan Anda.',
      )
      setChannelStatus({ loading: false, message: msg })
      throw err
    }
  }

  const handlePinMessage = async (messageId: number) => {
    if (!selectedChannelId) return
    try {
      await api.put(`/channels/${selectedChannelId}/messages/${messageId}/pin`)
      void refreshChannel(selectedChannelId, selectedThreadId, true)
    } catch (err) {
      const msg = extractErrorMessage(err, 'Pin pesan gagal diperbarui.')
      setChannelStatus({ loading: false, message: msg })
    }
  }

  const handleSendThreadReply = async (parentId: number, content: string, alsoToChannel?: boolean) => {
    if (!selectedChannelId || !currentUser) return
    const channelId = selectedChannelId
    const result = await api.post<{ data: { id: number; createdAt?: string } }>(`/channels/${channelId}/messages`, {
      content,
      parentMessageId: parentId,
    })

    // Optimistic: append to thread replies + bump parent count in main feed
    const optimistic = {
      id: result.data.id,
      channelId,
      userId: currentUser.id,
      content,
      replyCount: 0,
      reactions: {} as Record<string, number[]>,
      isPinned: false,
      isEdited: false,
      parentMessageId: parentId,
      createdAt: result.data.createdAt ?? new Date().toISOString(),
      updatedAt: result.data.createdAt ?? new Date().toISOString(),
      authorName: currentUser.name,
      authorRole: currentUser.roleType,
    }
    setThreadReplies((prev) => prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic])
    setMessages((prev) => prev.map((m) => m.id === parentId ? { ...m, replyCount: m.replyCount + 1 } : m))

    if (alsoToChannel) {
      void api.post(`/channels/${channelId}/messages`, {
        content: `↩ _from thread:_ ${content}`,
      })
    }
  }

  const handleCreateChannel = async (data: { name: string; description?: string; type: 'PUBLIC' | 'PRIVATE' }) => {
    await api.post('/channels', data)
    // SSE channel:created will add to list — also reload overview to refresh sidebar counts
    await loadOverview('refresh')
  }

  const handleUpdateChannel = async (channelId: number, data: { name?: string; description?: string }) => {
    await api.put(`/channels/${channelId}`, data)
    // SSE channel:updated will patch in place
  }

  const handleArchiveChannel = async (channelId: number) => {
    await api.delete(`/channels/${channelId}`)
    // SSE channel:archived removes from list and clears selection
  }

  const handleAddMember = async (channelId: number, userId: number) => {
    await api.post(`/channels/${channelId}/members`, { userId })
    // Refresh channel to update member list
    void refreshChannel(channelId, null, true)
  }

  const handleToggleSaveMessage = async (messageId: number, currentlySaved: boolean) => {
    // Optimistic update
    setSavedMessageIds((prev) => {
      const next = new Set(prev)
      if (currentlySaved) next.delete(messageId); else next.add(messageId)
      return next
    })
    try {
      if (currentlySaved) await api.delete(`/saved-messages/${messageId}`)
      else await api.post(`/saved-messages/${messageId}`, {})
    } catch {
      // Revert on failure
      setSavedMessageIds((prev) => {
        const next = new Set(prev)
        if (currentlySaved) next.add(messageId); else next.delete(messageId)
        return next
      })
    }
  }

  const handleToggleMuteChannel = async (channelId: number, mute: boolean) => {
    if (!currentUser) return
    setMutedChannelIds((prev) => {
      const next = new Set(prev)
      if (mute) next.add(channelId); else next.delete(channelId)
      return next
    })
    try {
      await api.put(`/channels/${channelId}/members/${currentUser.id}/mute`, { isMuted: mute })
    } catch {
      setMutedChannelIds((prev) => {
        const next = new Set(prev)
        if (mute) next.delete(channelId); else next.add(channelId)
        return next
      })
    }
  }

  const isChannelMuted = (channelId: number) => mutedChannelIds.has(channelId)

  const handleToggleStar = async (channelId: number, isStarred: boolean) => {
    // Optimistic update
    setChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, isStarred } : c))
    try {
      await api.put(`/channels/${channelId}/star`, { isStarred })
    } catch {
      setChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, isStarred: !isStarred } : c))
    }
  }

  const handleBrowseChannels = async () => {
    const result = await api.get<{ data: Array<{ id: number; name: string; description?: string; memberCount: number; messageCount: number; isMember: boolean }> }>('/channels/browse')
    return result.data
  }

  const handleJoinChannel = async (channelId: number) => {
    await api.post(`/channels/${channelId}/join`, {})
    // Refresh sidebar to include the newly joined channel
    await loadOverview('refresh')
  }

  const handleOpenDM = async (userId: number) => {
    const result = await api.post<{ data: { id: number } }>('/dm/open', { userId })
    const dmChannelId = result.data.id
    // Refresh sidebar (if newly created, SSE channel:created should fire too)
    await loadOverview('refresh')
    setSelectedChannelId(dmChannelId)
    setSelectedThreadId(null)
  }

  const handleMarkAsRead = (channelId: number) => {
    // Optimistic: clear unread immediately in sidebar
    setChannels((prev) => prev.map((c) => c.id === channelId ? { ...c, unreadCount: 0 } : c))
    // Fire-and-forget — backend persists lastViewedAt
    void api.put(`/channels/${channelId}/read`)
  }

  const handleMarkAllAsRead = () => {
    setChannels((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })))
    void api.put(`/channels/read-all`)
  }

  const handleRemoveMember = async (channelId: number, userId: number) => {
    try {
      await api.delete(`/channels/${channelId}/members/${userId}`)
      void refreshChannel(channelId, null, true)
      void loadOverview('refresh')
    } catch (err) {
      const msg = extractErrorMessage(err, 'Anggota gagal dihapus dari channel.')
      setChannelStatus({ loading: false, message: msg })
      throw err
    }
  }

  const handleMarkMessageUnread = async (messageId: number) => {
    if (!selectedChannelId) return
    await api.put(`/channels/${selectedChannelId}/mark-unread`, { messageId })
    // Reflect in sidebar unread count immediately
    setChannels((prev) => prev.map((c) =>
      c.id === selectedChannelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
    ))
  }

  const handleRemindMessage = async (messageId: number, remindAt: Date, note?: string) => {
    if (!selectedChannelId) return
    await api.post('/reminders', {
      channelId: selectedChannelId,
      messageId,
      remindAt: remindAt.toISOString(),
      note,
    })
  }

  const handleLeaveChannel = async (channelId: number) => {
    if (!currentUser) return
    await api.delete(`/channels/${channelId}/members/${currentUser.id}`)
    if (selectedChannelId === channelId) {
      setSelectedChannelId(null)
      setSelectedThreadId(null)
    }
    await loadOverview('refresh')
  }

  return (
    <ChannelsView
      addableUsers={addableUsers}
      workspaceUsers={workspaceUsers}
      programs={programs}
      tasks={allTasks}
      channelMembers={channelMembers}
      channelStatus={channelStatus}
      channels={channels}
      composerValue={composerValue}
      currentUserId={currentUser?.id ?? null}
      messages={messages}
      onComposerChange={setComposerValue}
      onDeleteMessage={handleDeleteMessage}
      onEditMessage={handleEditMessage}
      onPinMessage={handlePinMessage}
      onReactEmoji={handleReactEmoji}
      onSelectChannel={(channelId) => {
        // Snapshot unread count NOW — before handleMarkAsRead batches setChannels(unreadCount: 0)
        const ch = channels.find((c) => c.id === channelId)
        setChannelEntryUnread(ch?.unreadCount ?? 0)
        setSelectedChannelId(channelId)
        setSelectedThreadId(null)
        handleMarkAsRead(channelId)
      }}
      onMarkAllAsRead={handleMarkAllAsRead}
      onOpenDM={handleOpenDM}
      onToggleStar={handleToggleStar}
      onlineUserIds={onlineUserIds}
      presenceStatusMap={presenceStatusMap}
      dmPartnerPresence={dmPartnerPresence}
      onBrowseChannels={handleBrowseChannels}
      onJoinChannel={handleJoinChannel}
      savedMessageIds={savedMessageIds}
      onToggleSaveMessage={handleToggleSaveMessage}
      onToggleMuteChannel={handleToggleMuteChannel}
      isChannelMuted={isChannelMuted}
      onSelectThread={setSelectedThreadId}
      onSendMessage={(e, attachments) => void handleSendMessage(e, attachments)}
      onSendThreadReply={handleSendThreadReply}
      onUploadFiles={handleUploadFiles}
      onCreateChannel={handleCreateChannel}
      onUpdateChannel={handleUpdateChannel}
      onArchiveChannel={handleArchiveChannel}
      onAddMember={handleAddMember}
      onRemoveMember={handleRemoveMember}
      onLeaveChannel={handleLeaveChannel}
      onMarkAsRead={handleMarkAsRead}
      onMarkMessageUnread={handleMarkMessageUnread}
      onRemindMessage={handleRemindMessage}
      onTyping={() => { if (selectedChannelId) sendTyping(selectedChannelId) }}
      channelEntryUnread={channelEntryUnread}
      sending={sending}
      selectedChannel={selectedChannel}
      selectedChannelId={selectedChannelId}
      selectedThreadId={selectedThreadId}
      threadParent={threadParent}
      threadReplies={threadReplies}
      typingUsers={channelTypingUsers}
    />
  )
}

export default ChannelsViewWrapper
