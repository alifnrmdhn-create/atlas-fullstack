<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Greenfield reset Program: hapus semua program existing (DRAFT/ACTIVE/dummy),
 * seed 1 golden program "Penguatan BCMS dan Resiliensi Korporasi" sesuai
 * sumber PPTX Monitoring Program Kerja DKMR April 2026 (slide 42 & 63).
 *
 * Approval chain (2-step existing):
 *   SUBMITTED  by Este Angga Yustika (ASISTEN, owner)  -> PENDING_KASUB
 *   APPROVED   by Alif Nugraha Ramadhan (KASUBDIV)     -> PENDING_KADIV
 *   APPROVED   by Eman Siswanto (KADIV)                -> ACTIVE
 *
 * Direktur DIMR (M. Iswahyudi, BOD) hadir di ProgramProgressLog sebagai
 * oversight eksekutif. Co-PIC executor: Fadil Lubis & Dwi Zunianti via
 * EntityPic + task assignment.
 *
 * Resolve user via email (stable identifier antar environment). Skip migration
 * jika 6 user core belum ada (test DB / fresh CI environment) — supaya
 * migration aman di RefreshDatabase test runner & Railway prod.
 *
 * Cascade behavior saat DELETE Program:
 *   - Initiative, WorkItem (via Initiative), KpiDefinition, ProgramKpiLink,
 *     ProgramApprovalLog, ProgramProgressLog, monthly_report_programs : CASCADE
 *   - Assignment.relatedProgramId, EscalationRequest.linkedProgramId      : SET NULL
 *   - entity_pics (polymorphic, no FK)                                    : manual cleanup
 */
return new class extends Migration
{
    public function up(): void
    {
        $requiredEmails = [
            'este.angga.yustika@ptpn.id',
            'fadil.kurniawan.lubis@ptpn.id',
            'dwi.zunianti@ptpn.id',
            'alif.nugraha.ramadhan@ptpn.id',
            'eman.siswanto@ptpn.id',
            'bod_kmr@ptpn.id',
        ];

        $emailToId = DB::table('User')
            ->whereIn('email', $requiredEmails)
            ->pluck('id', 'email')
            ->all();

        // Skip migration kalau ada email belum resolved. Cek per-email
        // (lebih aman daripada count check yang bisa miss case duplicate).
        $missing = array_filter($requiredEmails, fn ($e) => !isset($emailToId[$e]));
        if (!empty($missing)) {
            return;
        }

        $este  = $emailToId['este.angga.yustika@ptpn.id'];
        $fadil = $emailToId['fadil.kurniawan.lubis@ptpn.id'];
        $dwi   = $emailToId['dwi.zunianti@ptpn.id'];
        $alif  = $emailToId['alif.nugraha.ramadhan@ptpn.id'];
        $eman  = $emailToId['eman.siswanto@ptpn.id'];
        $bod   = $emailToId['bod_kmr@ptpn.id'];

        DB::transaction(function () use ($este, $fadil, $dwi, $alif, $eman, $bod) {
            DB::table('Program')->delete();

            DB::table('entity_pics')
                ->whereIn('entityType', ['Program', 'Initiative', 'Phase', 'WorkItem'])
                ->delete();

            $programId = DB::table('Program')->insertGetId([
                'code'                  => 'DIMR-HLD-BCMS-001',
                'name'                  => 'Penguatan Business Continuity Management dan Resiliensi Korporasi',
                'description'           => 'Penguatan BCMS sesuai ISO 22301 untuk membangun resiliensi korporat PTPN III. Cakupan: penyusunan kebijakan, pedoman, dan SOP BCMS; pembentukan Tim BCMS holding; serta pelatihan, sosialisasi, dan simulasi tanggap darurat.',
                'strategicObjective'    => 'Strategi Manajemen Risiko Terintegrasi',
                'kelompok'              => 'SCORECARD',
                'pilarStrategis'        => 'ENABLER',
                'progresTerkini'        => 'Draft awal dokumen framework yang meliputi Kebijakan, Pedoman, dan SOP BCMS telah disusun dan sedang dalam proses peninjauan Kasubdiv.',
                'dukunganDibutuhkan'    => null,
                'ownerId'               => $este,
                'ownerUnitId'           => null,
                'status'                => 'IN_PROGRESS',
                'priority'              => 'HIGH',
                'progressPercent'       => 35,
                'healthStatus'          => 'YELLOW',
                'startDate'             => '2026-01-01 00:00:00',
                'targetEndDate'         => '2026-12-31 23:59:59',
                'approvalStatus'        => 'ACTIVE',
                'submittedById'         => $este,
                'hasNoApmsKpi'          => false,
                'createdAt'             => '2026-01-05 09:00:00',
                'updatedAt'             => '2026-04-30 17:00:00',
                'autoHealthComputedAt'  => '2026-04-30 17:00:00',
            ]);

            $ws1Id = DB::table('Initiative')->insertGetId([
                'code'               => 'DIMR-HLD-BCMS-001-WS-01',
                'programId'          => $programId,
                'name'               => 'Penyusunan Framework BCMS (Kebijakan, Pedoman, SOP)',
                'description'        => 'Menyusun kebijakan, pedoman, dan 4 SOP BCMS dengan mengacu pada ISO 22301 dan menyesuaikan dengan kondisi perusahaan perkebunan PTPN III.',
                'ownerId'            => $este,
                'status'             => 'IN_PROGRESS',
                'priority'           => 'HIGH',
                'startDate'          => '2026-01-01 00:00:00',
                'targetCompletion'   => '2026-06-30 23:59:59',
                'progressPercent'    => 50,
                'healthStatus'       => 'YELLOW',
                'primaryPicPersonId' => $este,
                'createdAt'          => '2026-01-05 09:00:00',
                'updatedAt'          => '2026-04-30 17:00:00',
            ]);

            $ws2Id = DB::table('Initiative')->insertGetId([
                'code'               => 'DIMR-HLD-BCMS-001-WS-02',
                'programId'          => $programId,
                'name'               => 'Pembentukan Tim BCMS & Simulasi Tanggap Darurat',
                'description'        => 'Membentuk Tim BCMS pada level holding, melaksanakan pelatihan, sosialisasi, dan simulasi tanggap darurat (tabletop exercise dan live drill).',
                'ownerId'            => $fadil,
                'status'             => 'BACKLOG',
                'priority'           => 'HIGH',
                'startDate'          => '2026-07-01 00:00:00',
                'targetCompletion'   => '2026-12-31 23:59:59',
                'progressPercent'    => 15,
                'healthStatus'       => 'YELLOW',
                'primaryPicPersonId' => $fadil,
                'createdAt'          => '2026-01-05 09:00:00',
                'updatedAt'          => '2026-04-30 17:00:00',
            ]);

            DB::table('WorkItem')->insert([
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-01',
                    'initiativeId'     => $ws1Id,
                    'title'            => 'Identifikasi gap kesesuaian draft pedoman BCMS',
                    'description'      => 'Tabletop exercise untuk identifikasi gap kesesuaian draft pedoman BCMS. Output: notula DIMR/MoM/01/2026 (8 Januari 2026).',
                    'assignedTo'       => $dwi,
                    'createdBy'        => $este,
                    'status'           => 'COMPLETED',
                    'priority'         => 'HIGH',
                    'percentComplete'  => 100,
                    'startDate'        => '2026-01-01 00:00:00',
                    'targetCompletion' => '2026-01-15 23:59:59',
                    'actualCompletion' => '2026-01-08 17:00:00',
                    'healthStatus'     => 'GREEN',
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-01-08 17:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-02',
                    'initiativeId'     => $ws1Id,
                    'title'            => 'Evaluasi review kecukupan Dokumen BCMS',
                    'description'      => 'Review kecukupan dokumen pedoman BCMS bersama tim subdiv. Output: notula review.',
                    'assignedTo'       => $fadil,
                    'createdBy'        => $este,
                    'status'           => 'COMPLETED',
                    'priority'         => 'HIGH',
                    'percentComplete'  => 100,
                    'startDate'        => '2026-02-01 00:00:00',
                    'targetCompletion' => '2026-02-28 23:59:59',
                    'actualCompletion' => '2026-02-25 17:00:00',
                    'healthStatus'     => 'GREEN',
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-02-25 17:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-03',
                    'initiativeId'     => $ws1Id,
                    'title'            => 'Penyempurnaan SOP dan Pedoman BCMS',
                    'description'      => 'Menyusun kebijakan, pedoman, dan 4 SOP BCMS mengacu pada ISO 22301. Saat ini dalam proses peninjauan Kasubdiv.',
                    'assignedTo'       => $este,
                    'createdBy'        => $este,
                    'status'           => 'IN_REVIEW',
                    'priority'         => 'HIGH',
                    'percentComplete'  => 50,
                    'startDate'        => '2026-03-01 00:00:00',
                    'targetCompletion' => '2026-06-30 23:59:59',
                    'actualCompletion' => null,
                    'healthStatus'     => 'YELLOW',
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-04-30 17:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-04',
                    'initiativeId'     => $ws2Id,
                    'title'            => 'Pembentukan Tim BCMS Level Holding',
                    'description'      => 'Pembentukan Tim BCMS PTPN III (Persero) level holding. Output: SK Tim BCMS.',
                    'assignedTo'       => $fadil,
                    'createdBy'        => $este,
                    'status'           => 'BACKLOG',
                    'priority'         => 'HIGH',
                    'percentComplete'  => 0,
                    'startDate'        => null,
                    'targetCompletion' => '2026-08-31 23:59:59',
                    'actualCompletion' => null,
                    'healthStatus'     => 'YELLOW',
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-04-30 17:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-05',
                    'initiativeId'     => $ws2Id,
                    'title'            => 'Pelatihan Tim BCMS terkait Tanggap Darurat',
                    'description'      => 'Training Tim BCMS untuk respons tanggap darurat. Output: laporan pelatihan.',
                    'assignedTo'       => $dwi,
                    'createdBy'        => $este,
                    'status'           => 'BACKLOG',
                    'priority'         => 'MEDIUM',
                    'percentComplete'  => 0,
                    'startDate'        => null,
                    'targetCompletion' => '2026-09-30 23:59:59',
                    'actualCompletion' => null,
                    'healthStatus'     => null,
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-01-05 09:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-06',
                    'initiativeId'     => $ws2Id,
                    'title'            => 'Sosialisasi Respon Tanggap Darurat',
                    'description'      => 'Sosialisasi prosedur respons tanggap darurat ke seluruh karyawan kantor holding. Output: notula sosialisasi.',
                    'assignedTo'       => $dwi,
                    'createdBy'        => $este,
                    'status'           => 'BACKLOG',
                    'priority'         => 'MEDIUM',
                    'percentComplete'  => 0,
                    'startDate'        => null,
                    'targetCompletion' => '2026-10-31 23:59:59',
                    'actualCompletion' => null,
                    'healthStatus'     => null,
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-01-05 09:00:00',
                ],
                [
                    'code'             => 'DIMR-HLD-BCMS-001-T-07',
                    'initiativeId'     => $ws2Id,
                    'title'            => 'Simulasi Keadaan Bencana (Live Drill)',
                    'description'      => 'Simulasi live drill skenario bencana di kantor holding. Output: laporan hasil simulasi.',
                    'assignedTo'       => $fadil,
                    'createdBy'        => $este,
                    'status'           => 'BACKLOG',
                    'priority'         => 'HIGH',
                    'percentComplete'  => 0,
                    'startDate'        => null,
                    'targetCompletion' => '2026-12-15 23:59:59',
                    'actualCompletion' => null,
                    'healthStatus'     => null,
                    'isBlocked'        => false,
                    'createdAt'        => '2026-01-05 09:00:00',
                    'updatedAt'        => '2026-01-05 09:00:00',
                ],
            ]);

            DB::table('ProgramApprovalLog')->insert([
                [
                    'programId'  => $programId,
                    'action'     => 'SUBMITTED',
                    'fromStatus' => 'DRAFT',
                    'toStatus'   => 'PENDING_KASUB',
                    'byUserId'   => $este,
                    'byUserName' => 'Este Angga Yustika',
                    'note'       => 'Submit usulan program Penguatan BCMS untuk approval Kasubdiv.',
                    'createdAt'  => '2026-01-05 09:30:00',
                ],
                [
                    'programId'  => $programId,
                    'action'     => 'APPROVED',
                    'fromStatus' => 'PENDING_KASUB',
                    'toStatus'   => 'PENDING_KADIV',
                    'byUserId'   => $alif,
                    'byUserName' => 'Alif Nugraha Ramadhan',
                    'note'       => 'Disetujui Kasubdiv. Cakupan 7 deliverables sesuai roadmap MR 2026. Lanjut ke Kadiv.',
                    'createdAt'  => '2026-01-07 10:30:00',
                ],
                [
                    'programId'  => $programId,
                    'action'     => 'APPROVED',
                    'fromStatus' => 'PENDING_KADIV',
                    'toStatus'   => 'ACTIVE',
                    'byUserId'   => $eman,
                    'byUserName' => 'Eman Siswanto',
                    'note'       => 'Program disetujui Kadiv. Aktif sejak 9 Januari 2026. Pastikan koordinasi dengan Direktur DIMR untuk milestone Q2.',
                    'createdAt'  => '2026-01-09 14:00:00',
                ],
            ]);

            DB::table('ProgramProgressLog')->insert([
                [
                    'programId'          => $programId,
                    'period'             => '2026-01',
                    'healthAtTime'       => 'on_track',
                    'narrative'          => 'Tabletop exercise dilaksanakan 8 Januari 2026 (notula DIMR/MoM/01/2026). Identifikasi gap pedoman BCMS selesai. Penyusunan kebijakan dan SOP dimulai mengacu ISO 22301.',
                    'kendala'            => null,
                    'dukunganDibutuhkan' => null,
                    'createdById'        => $este,
                    'createdByName'      => 'Este Angga Yustika',
                    'createdAt'          => '2026-01-31 16:00:00',
                ],
                [
                    'programId'          => $programId,
                    'period'             => '2026-04',
                    'healthAtTime'       => 'at_risk',
                    'narrative'          => 'Review eksekutif Direktur DIMR (30 April 2026). Penyusunan SOP & Pedoman saat ini 50%, target Q2 wajib selesai. Catatan: percepat eksekusi penyempurnaan SOP sebelum tabletop simulation Q3.',
                    'kendala'            => 'Beberapa SOP perlu penyesuaian dengan kondisi unit operasional perkebunan (lokasi, perimeter, jenis aset). Reviewer subdiv minta tambahan detail di bab Kontinjensi.',
                    'dukunganDibutuhkan' => 'Persetujuan Direktur untuk publikasi pedoman BCMS final. Akses ke data risiko unit operasional untuk validasi skenario kontinjensi.',
                    'createdById'        => $bod,
                    'createdByName'      => 'M. Iswahyudi',
                    'createdAt'          => '2026-04-30 14:00:00',
                ],
            ]);

            $now = '2026-01-05 09:00:00';
            DB::table('entity_pics')->insert([
                ['entityType' => 'Program',    'entityId' => $programId, 'userId' => $este,  'isPrimary' => true,  'createdAt' => $now],
                ['entityType' => 'Program',    'entityId' => $programId, 'userId' => $fadil, 'isPrimary' => false, 'createdAt' => $now],
                ['entityType' => 'Program',    'entityId' => $programId, 'userId' => $dwi,   'isPrimary' => false, 'createdAt' => $now],
                ['entityType' => 'Initiative', 'entityId' => $ws1Id,     'userId' => $este,  'isPrimary' => true,  'createdAt' => $now],
                ['entityType' => 'Initiative', 'entityId' => $ws1Id,     'userId' => $fadil, 'isPrimary' => false, 'createdAt' => $now],
                ['entityType' => 'Initiative', 'entityId' => $ws2Id,     'userId' => $fadil, 'isPrimary' => true,  'createdAt' => $now],
                ['entityType' => 'Initiative', 'entityId' => $ws2Id,     'userId' => $dwi,   'isPrimary' => false, 'createdAt' => $now],
            ]);
        });
    }

    public function down(): void
    {
        DB::table('Program')->where('code', 'DIMR-HLD-BCMS-001')->delete();
    }
};
