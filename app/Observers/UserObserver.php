<?php

namespace App\Observers;

use App\Models\Channel;
use App\Models\ChannelMember;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class UserObserver
{
    public function created(User $user): void
    {
        $onboardingChannelId = Channel::query()
            ->where('code', 'panduan-channels')
            ->value('id');

        if (!$onboardingChannelId) return;

        ChannelMember::query()->updateOrCreate(
            ['channelId' => $onboardingChannelId, 'userId' => $user->id],
            ['isMuted' => false, 'isStarred' => false],
        );
    }
}
