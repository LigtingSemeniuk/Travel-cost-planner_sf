<?php

namespace App\Controller\Api;

use App\Entity\Trip;
use App\Entity\TripExpense;
use App\Entity\User;
use App\Repository\TripRepository;
use App\Service\TripCalculatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api')]
class TripController extends AbstractController
{
    private function authUser(Request $request, EntityManagerInterface $em): ?User
    {
        $uid = $request->getSession()->get('uid');
        if (!$uid) return null;
        return $em->getRepository(User::class)->find($uid);
    }

    private function serializeTrip(Trip $trip, TripCalculatorService $calc): array
    {
        return [
            'id' => $trip->getId(),
            'title' => $trip->getTitle(),
            'distance_km' => $trip->getDistanceKm(),
            'fuel_price' => $trip->getFuelPrice(),
            'fuel_consumption_per_100' => $trip->getFuelConsumptionPer100(),
            'people_count' => $trip->getPeopleCount(),
            'route_cost' => $trip->getRouteCost(),
            'lodging_cost' => $trip->getLodgingCost(),
            'food_cost' => $trip->getFoodCost(),
            'other_cost' => $trip->getOtherCost(),
            'start_date' => $trip->getStartDate()?->format('Y-m-d'),
            'end_date' => $trip->getEndDate()?->format('Y-m-d'),
            'created_at' => $trip->getCreatedAt()->format(DATE_ATOM),
            'calc' => $calc->calculate($trip),
        ];
    }

    private function fillTripFromRequest(Trip $trip, array $data): void
    {
        $trip->setTitle((string)($data['title'] ?? ''));
        $trip->setDistanceKm((float)($data['distance_km'] ?? 0));
        $trip->setFuelPrice((float)($data['fuel_price'] ?? 0));
        $trip->setFuelConsumptionPer100((float)($data['fuel_consumption_per_100'] ?? 0));
        $trip->setPeopleCount((int)($data['people_count'] ?? 1));
        $trip->setRouteCost((float)($data['route_cost'] ?? 0));
        $trip->setLodgingCost((float)($data['lodging_cost'] ?? 0));
        $trip->setFoodCost((float)($data['food_cost'] ?? 0));
        $trip->setOtherCost((float)($data['other_cost'] ?? 0));

        $start = $data['start_date'] ?? null;
        $end = $data['end_date'] ?? null;

        $trip->setStartDate($start ? new \DateTime((string)$start) : null);
        $trip->setEndDate($end ? new \DateTime((string)$end) : null);
    }

    #[Route('/trips', methods: ['GET'])]
    public function list(Request $request, EntityManagerInterface $em, TripRepository $repo, TripCalculatorService $calc): JsonResponse
    {
        $user = $this->authUser($request, $em);
        if (!$user) return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);

        $items = array_map(fn(Trip $t) => $this->serializeTrip($t, $calc), $repo->findByUserOrdered($user));
        return $this->json(['ok' => true, 'items' => $items]);
    }

    #[Route('/trips', methods: ['POST'])]
    public function create(Request $request, EntityManagerInterface $em, ValidatorInterface $validator, TripCalculatorService $calc): JsonResponse
    {
        $user = $this->authUser($request, $em);
        if (!$user) return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);

        $data = json_decode($request->getContent(), true) ?? [];

        $trip = new Trip();
        $trip->setUser($user);
        $this->fillTripFromRequest($trip, $data);

        $errors = [];
        foreach ($validator->validate($trip) as $e) {
            $errors[] = $e->getPropertyPath() . ': ' . $e->getMessage();
        }
        if ($errors) return $this->json(['ok' => false, 'errors' => $errors], 422);

        foreach (($data['expenses'] ?? []) as $row) {
            $expense = (new TripExpense())
                ->setCategory((string)($row['category'] ?? 'other'))
                ->setDescription(isset($row['description']) ? (string)$row['description'] : null)
                ->setAmount((float)($row['amount'] ?? 0));
            $trip->addExpense($expense);
        }

        $em->persist($trip);
        $em->flush();

        return $this->json(['ok' => true, 'item' => $this->serializeTrip($trip, $calc)], 201);
    }

    #[Route('/trip/{id}', methods: ['GET'])]
    public function getOne(int $id, Request $request, EntityManagerInterface $em, TripCalculatorService $calc): JsonResponse
    {
        $user = $this->authUser($request, $em);
        if (!$user) return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);

        $trip = $em->getRepository(Trip::class)->find($id);
        if (!$trip || $trip->getUser()?->getId() !== $user->getId()) {
            return $this->json(['ok' => false, 'error' => 'Not found'], 404);
        }

        return $this->json(['ok' => true, 'item' => $this->serializeTrip($trip, $calc)]);
    }

    #[Route('/trip/{id}', methods: ['PUT'])]
    public function update(int $id, Request $request, EntityManagerInterface $em, ValidatorInterface $validator, TripCalculatorService $calc): JsonResponse
    {
        $user = $this->authUser($request, $em);
        if (!$user) return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);

        $trip = $em->getRepository(Trip::class)->find($id);
        if (!$trip || $trip->getUser()?->getId() !== $user->getId()) {
            return $this->json(['ok' => false, 'error' => 'Not found'], 404);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $this->fillTripFromRequest($trip, $data);

        $errors = [];
        foreach ($validator->validate($trip) as $e) {
            $errors[] = $e->getPropertyPath() . ': ' . $e->getMessage();
        }
        if ($errors) return $this->json(['ok' => false, 'errors' => $errors], 422);

        foreach ($trip->getExpenses()->toArray() as $old) {
            $em->remove($old);
        }

        foreach (($data['expenses'] ?? []) as $row) {
            $expense = (new TripExpense())
                ->setCategory((string)($row['category'] ?? 'other'))
                ->setDescription(isset($row['description']) ? (string)$row['description'] : null)
                ->setAmount((float)($row['amount'] ?? 0));
            $trip->addExpense($expense);
        }

        $em->flush();

        return $this->json(['ok' => true, 'item' => $this->serializeTrip($trip, $calc)]);
    }

    #[Route('/trip/{id}', methods: ['DELETE'])]
    public function delete(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $user = $this->authUser($request, $em);
        if (!$user) return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);

        $trip = $em->getRepository(Trip::class)->find($id);
        if (!$trip || $trip->getUser()?->getId() !== $user->getId()) {
            return $this->json(['ok' => false, 'error' => 'Not found'], 404);
        }

        $em->remove($trip);
        $em->flush();

        return $this->json(['ok' => true]);
    }
}