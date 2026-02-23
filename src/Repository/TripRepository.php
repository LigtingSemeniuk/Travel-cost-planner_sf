<?php

namespace App\Repository;

use App\Entity\Trip;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class TripRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Trip::class);
    }

    public function findByUserOrdered(User $user): array
    {
        return $this->createQueryBuilder('t')
            ->andWhere('t.user = :user')
            ->setParameter('user', $user)
            ->orderBy('t.createdAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    public function getUserSummary(User $user): array
    {
        $row = $this->createQueryBuilder('t')
            ->select('COUNT(t.id) as tripsCount')
            ->addSelect('COALESCE(SUM(t.routeCost + t.lodgingCost + t.foodCost + t.otherCost), 0) as extrasTotal')
            ->andWhere('t.user = :user')
            ->setParameter('user', $user)
            ->getQuery()
            ->getSingleResult();

        return [
            'tripsCount' => (int)($row['tripsCount'] ?? 0),
            'extrasTotal' => (float)($row['extrasTotal'] ?? 0),
        ];
    }
}