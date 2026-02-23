<?php

namespace App\Service;

use App\Entity\Trip;

class TripCalculatorService
{
    public function calculate(Trip $trip): array
    {
        $liters = ($trip->getDistanceKm() / 100) * $trip->getFuelConsumptionPer100();
        $fuelCost = $liters * $trip->getFuelPrice();

        $extras = $trip->getRouteCost() + $trip->getLodgingCost() + $trip->getFoodCost() + $trip->getOtherCost();
        $total = $fuelCost + $extras;
        $perPerson = $trip->getPeopleCount() > 0 ? $total / $trip->getPeopleCount() : $total;

        return [
            'liters' => round($liters, 2),
            'fuelCost' => round($fuelCost, 2),
            'extrasCost' => round($extras, 2),
            'totalCost' => round($total, 2),
            'costPerPerson' => round($perPerson, 2),
            'breakdown' => [
                'fuel' => round($fuelCost, 2),
                'route' => round($trip->getRouteCost(), 2),
                'lodging' => round($trip->getLodgingCost(), 2),
                'food' => round($trip->getFoodCost(), 2),
                'other' => round($trip->getOtherCost(), 2),
            ],
        ];
    }
}