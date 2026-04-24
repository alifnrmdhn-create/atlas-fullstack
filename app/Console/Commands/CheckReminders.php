<?php

namespace App\Console\Commands;

use App\Models\MessageReminder;
use App\Models\Notification;
use App\Services\BroadcastService;
use Illuminate\Console\Command;

/**
 * Port dari backend/src/routes/realtime.ts → startReminderChecker().
 * Port dari Node.js setInterval(60_000) ke Laravel Scheduler everyMinute.
 */
class CheckReminders extends Command
{
    protected $signature = 'atlas:check-reminders';
    protected $description = 'Fire due message reminders — create notification + SSE push.';

    public function handle(): int
    {
        $due = MessageReminder::query()
            ->where('notified', false)
            ->where('remindAt', '<=', now())
            ->get();

        foreach ($due as $reminder) {
            try {
                $note = Notification::create([
                    'userId' => $reminder->userId,
                    'type' => 'reminder',
                    'message' => $reminder->note
                        ? "Reminder: \"{$reminder->note}\""
                        : 'You asked to be reminded about a message.',
                    'source' => "channel:{$reminder->channelId}:message:{$reminder->messageId}",
                    'createdAt' => now(),
                    'expiresAt' => now()->addDays(30),
                    'state' => 'UNREAD',
                ]);

                $reminder->update(['notified' => true]);

                BroadcastService::toUsers('notification:created', [
                    'notification' => [
                        'id' => $note->id,
                        'type' => $note->type,
                        'message' => $note->message,
                        'source' => $note->source,
                        'state' => $note->state,
                        'createdAt' => $note->createdAt->toIso8601String(),
                        'expiresAt' => $note->expiresAt?->toIso8601String(),
                    ],
                ], [$reminder->userId]);

                BroadcastService::toUsers('reminder:due', [
                    'reminderId' => $reminder->id,
                    'channelId' => $reminder->channelId,
                    'messageId' => $reminder->messageId,
                    'note' => $reminder->note,
                ], [$reminder->userId]);

                $this->info("Fired reminder #{$reminder->id} to user {$reminder->userId}");
            } catch (\Throwable $e) {
                $this->error("Reminder #{$reminder->id} failed: {$e->getMessage()}");
            }
        }

        return Command::SUCCESS;
    }
}
