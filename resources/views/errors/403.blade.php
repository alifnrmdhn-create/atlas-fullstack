@extends('errors.layout')
@section('code', '403')
@section('title', 'Akses ditolak')
@section('message', $exception->getMessage() ?: 'Anda tidak punya akses ke halaman ini. Jika menurut Anda ini keliru, hubungi admin atau pemilik sumber daya.')
