<?php

namespace App\Auth;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\EntityPic;
use App\Models\Program;
use App\Models\Task;
use App\Models\Workstream;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Port dari backend/src/lib/scope.ts → getProgramIdsViaMembership().
 *
 * Mengembalikan daftar program-id yang user "terlihat" lewat partisipasi,
 * di luar scope unit. User dianggap partisipan jika:
 *   1. Owner Program.
 *   2. Co-PIC Program (via entity_pics — ganti picPersonIds JSON legacy).
 *   3. Owner Workstream di program tsb.
 *   4. Assignee Task di workstream di program tsb.
 *   5. Member Channel yang linked ke program/workstream.
 *
 * Penting: program kolaboratif lintas unit (mis. Penyehatan SGN) harus tetap
 * terlihat oleh kontributor dari direktorat lain meski scope unit tidak
 * mencakup owner program.
 *
 * Caching: 30 detik TTL. Invalidate saat picPersonIds / membership berubah.
 */
class MembershipResolver
{
    private const TTL_SECONDS = 30;

    /** @return array<int> */
    public function getProgramIdsViaMembership(int $userId): array
    {
        $cacheKey = "membership:user:{$userId}";

        return Cache::remember($cacheKey, self::TTL_SECONDS, function () use ($userId) {
            return $this->computeProgramIds($userId);
        });
    }

    public function invalidate(int $userId): void
    {
        Cache::forget("membership:user:{$userId}");
    }

    /** @param array<int> $userIds */
    public function invalidateMany(array $userIds): void
    {
        foreach ($userIds as $id) {
            $this->invalidate((int) $id);
        }
    }

    /** @return array<int> */
    private function computeProgramIds(int $userId): array
    {
        $ids = [];

        // 1. Owner Program
        foreach (Program::query()->where('ownerId', $userId)->pluck('id') as $id) {
            $ids[(int) $id] = true;
        }

        // 2. Co-PIC Program (via entity_pics) — ganti picPersonIds JSON legacy
        $coPicProgramIds = EntityPic::query()
            ->where('entityType', 'Program')
            ->where('userId', $userId)
            ->pluck('entityId');
        foreach ($coPicProgramIds as $id) {
            $ids[(int) $id] = true;
        }

        // 2b. Fallback: picPersonIds JSON legacy pada Program (selama data lama belum dimigrasi)
        //     JSON @> operator PostgreSQL.
        $legacyCoPicIds = DB::table('Program')
            ->whereRaw('"picPersonIds"::jsonb @> ?::jsonb', [json_encode([$userId])])
            ->pluck('id');
        foreach ($legacyCoPicIds as $id) {
            $ids[(int) $id] = true;
        }

        // 3. Owner Workstream → programId
        $wsProgramIds = Workstream::query()
            ->where('ownerId', $userId)
            ->pluck('programId');
        foreach ($wsProgramIds as $id) {
            $ids[(int) $id] = true;
        }

        // 4. Assignee Task → workstream.programId
        $taskProgramIds = Task::query()
            ->where('assignedTo', $userId)
            ->join('Initiative', 'WorkItem.initiativeId', '=', 'Initiative.id')
            ->pluck('Initiative.programId');
        foreach ($taskProgramIds as $id) {
            $ids[(int) $id] = true;
        }

        // 5. Member Channel → linkedProgramId + linkedInitiativeId(→programId)
        $memberChannels = Channel::query()
            ->join('ChannelMember', 'Channel.id', '=', 'ChannelMember.channelId')
            ->where('ChannelMember.userId', $userId)
            ->get(['Channel.linkedProgramId', 'Channel.linkedInitiativeId']);

        $linkedWorkstreamIds = [];
        foreach ($memberChannels as $ch) {
            if (!is_null($ch->linkedProgramId)) {
                $ids[(int) $ch->linkedProgramId] = true;
            }
            if (!is_null($ch->linkedInitiativeId)) {
                $linkedWorkstreamIds[] = (int) $ch->linkedInitiativeId;
            }
        }

        if (!empty($linkedWorkstreamIds)) {
            $wsProgramIdsFromChannels = Workstream::query()
                ->whereIn('id', array_unique($linkedWorkstreamIds))
                ->pluck('programId');
            foreach ($wsProgramIdsFromChannels as $id) {
                $ids[(int) $id] = true;
            }
        }

        return array_keys($ids);
    }
}
