<?php

namespace App\Controller\Api;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api')]
class AuthController extends AbstractController
{
    #[Route('/register', methods: ['POST'])]
    public function register(
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $hasher,
        ValidatorInterface $validator
    ): JsonResponse {
        $data = json_decode($request->getContent(), true) ?? [];
        $email = mb_strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');

        $user = (new User())->setEmail($email);

        $errors = [];
        foreach ($validator->validate($user) as $e) {
            $errors[] = $e->getMessage();
        }
        if (mb_strlen($password) < 6) {
            $errors[] = 'Password must be at least 6 characters.';
        }
        if ($errors) {
            return $this->json(['ok' => false, 'errors' => $errors], 422);
        }

        if ($em->getRepository(User::class)->findOneBy(['email' => $email])) {
            return $this->json(['ok' => false, 'error' => 'Email already exists.'], 409);
        }

        $user->setPassword($hasher->hashPassword($user, $password));
        $em->persist($user);
        $em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/login', methods: ['POST'])]
    public function login(Request $request, EntityManagerInterface $em, UserPasswordHasherInterface $hasher): JsonResponse
    {
        $data = json_decode($request->getContent(), true) ?? [];
        $email = mb_strtolower(trim((string)($data['email'] ?? '')));
        $password = (string)($data['password'] ?? '');

        $user = $em->getRepository(User::class)->findOneBy(['email' => $email]);
        if (!$user || !$hasher->isPasswordValid($user, $password)) {
            return $this->json(['ok' => false, 'error' => 'Invalid credentials.'], 401);
        }

        $request->getSession()->set('uid', $user->getId());

        return $this->json([
            'ok' => true,
            'user' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'roles' => $user->getRoles(),
            ],
        ]);
    }

    #[Route('/logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        $request->getSession()->remove('uid');
        return $this->json(['ok' => true]);
    }

    #[Route('/me', methods: ['GET'])]
    public function me(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $uid = $request->getSession()->get('uid');
        if (!$uid) {
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        $user = $em->getRepository(User::class)->find($uid);
        if (!$user) {
            $request->getSession()->remove('uid');
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        return $this->json([
            'ok' => true,
            'user' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'roles' => $user->getRoles(),
            ],
        ]);
    }
}