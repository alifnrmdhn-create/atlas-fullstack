<?php

namespace App\Enums;

enum PilarStrategis: string
{
    case CollectingMore      = 'COLLECTING_MORE';
    case SpendingBetter      = 'SPENDING_BETTER';
    case InnovativeFinancing = 'INNOVATIVE_FINANCING';
    case Enabler             = 'ENABLER';
    case NonScorecard        = 'NON_SCORECARD';
}
