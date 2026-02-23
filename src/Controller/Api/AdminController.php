<?php

namespace App\Controller\Api;

use App\Entity\Trip;
use App\Entity\User;
use App\Service\TripCalculatorService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin')]
class AdminController extends AbstractController
{
    private function admin(Request $request, EntityManagerInterface $em): ?User
    {
        $uid = $request->getSession()->get('uid');
        if (!$uid) return null;
        $user = $em->getRepository(User::class)->find($uid);
        if (!$user || !in_array('ROLE_ADMIN', $user->getRoles(), true)) return null;
        return $user;
    }

    #[Route('/users', methods: ['GET'])]
    public function users(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->admin($request, $em)) return $this->json(['ok' => false, 'error' => 'Forbidden'], 403);

        $rows = $em->getRepository(User::class)->findBy([], ['id' => 'DESC']);
        $items = array_map(fn(User $u) => [
            'id' => $u->getId(),
            'email' => $u->getEmail(),
            'roles' => $u->getRoles(),
            'created_at' => $u->getCreatedAt()->format(DATE_ATOM),
        ], $rows);

        return $this->json(['ok' => true, 'items' => $items]);
    }

    #[Route('/users/{id}/role', methods: ['PUT'])]
    public function changeRole(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->admin($request, $em)) return $this->json(['ok' => false, 'error' => 'Forbidden'], 403);

        $user = $em->getRepository(User::class)->find($id);
        if (!$user) return $this->json(['ok' => false, 'error' => 'User not found'], 404);

        $data = json_decode($request->getContent(), true) ?? [];
        $role = strtoupper((string)($data['role'] ?? 'ROLE_USER'));

        if (!in_array($role, ['ROLE_USER', 'ROLE_ADMIN'], true)) {
            return $this->json(['ok' => false, 'error' => 'Invalid role'], 422);
        }

        $user->setRoles([$role]);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/users/{id}', methods: ['DELETE'])]
    public function deleteUser(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->admin($request, $em)) return $this->json(['ok' => false, 'error' => 'Forbidden'], 403);

        $user = $em->getRepository(User::class)->find($id);
        if (!$user) return $this->json(['ok' => false, 'error' => 'User not found'], 404);

        $em->remove($user);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/trips', methods: ['GET'])]
    public function trips(Request $request, EntityManagerInterface $em, TripCalculatorService $calc): JsonResponse
    {
        if (!$this->admin($request, $em)) return $this->json(['ok' => false, 'error' => 'Forbidden'], 403);

        $rows = $em->getRepository(Trip::class)->findBy([], ['id' => 'DESC']);
        $items = array_map(fn(Trip $t) => [
            'id' => $t->getId(),
            'user_id' => $t->getUser()?->getId(),
            'user_email' => $t->getUser()?->getEmail(),
            'title' => $t->getTitle(),
            'created_at' => $t->getCreatedAt()->format(DATE_ATOM),
            'calc' => $calc->calculate($t),
        ], $rows);

        return $this->json(['ok' => true, 'items' => $items]);
    }

    #[Route('/trips/{id}', methods: ['DELETE'])]
    public function deleteTrip(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->admin($request, $em)) return $this->json(['ok' => false, 'error' => 'Forbidden'], 403);

        $trip = $em->getRepository(Trip::class)->find($id);
        if (!$trip) return $this->json(['ok' => false, 'error' => 'Trip not found'], 404);

        $em->remove($trip);
        $em->flush();

        return $this->json(['ok' => true]);
    }
}