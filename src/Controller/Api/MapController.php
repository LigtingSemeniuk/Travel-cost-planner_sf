<?php

namespace App\Controller\Api;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api')]
class MapController extends AbstractController
{
    private function authUser(Request $request, EntityManagerInterface $em): ?User
    {
        $uid = $request->getSession()->get('uid');
        if (!$uid) {
            return null;
        }

        return $em->getRepository(User::class)->find($uid);
    }

    #[Route('/geocode', methods: ['GET'])]
    public function geocode(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->authUser($request, $em)) {
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        $q = trim((string) $request->query->get('q', ''));
        if ($q === '') {
            return $this->json(['ok' => false, 'error' => 'Empty query'], 422);
        }

        $client = HttpClient::create();

        try {
            $response = $client->request('GET', 'https://nominatim.openstreetmap.org/search', [
                'query' => [
                    'format' => 'jsonv2',
                    'limit' => 5,
                    'q' => $q,
                ],
                'headers' => [
                    'User-Agent' => 'TravelCostPlanner/1.0 (Symfony App)',
                    'Accept' => 'application/json',
                ],
            ]);

            $rows = $response->toArray(false);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Geocoding API error: ' . $e->getMessage(),
            ], 502);
        }

        $items = [];
        foreach ($rows as $row) {
            $items[] = [
                'display_name' => $row['display_name'] ?? '',
                'lat' => isset($row['lat']) ? (float) $row['lat'] : null,
                'lng' => isset($row['lon']) ? (float) $row['lon'] : null,
            ];
        }

        return $this->json(['ok' => true, 'items' => $items]);
    }

    #[Route('/route', methods: ['POST'])]
    public function route(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->authUser($request, $em)) {
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $from = $data['from'] ?? null;
        $to = $data['to'] ?? null;

        if (
            !is_array($from) || !is_array($to) ||
            !isset($from['lat'], $from['lng'], $to['lat'], $to['lng'])
        ) {
            return $this->json(['ok' => false, 'error' => 'Invalid coordinates'], 422);
        }

        $apiKey = $_ENV['OPENROUTESERVICE_API_KEY'] ?? $_SERVER['OPENROUTESERVICE_API_KEY'] ?? '';
        if (!$apiKey) {
            return $this->json(['ok' => false, 'error' => 'OPENROUTESERVICE_API_KEY not configured'], 500);
        }

        $client = HttpClient::create();

        try {
            $response = $client->request('POST', 'https://api.openrouteservice.org/v2/directions/driving-car/geojson', [
                'headers' => [
                    'Authorization' => $apiKey,
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/geo+json',
                ],
                'json' => [
                    'coordinates' => [
                        [(float) $from['lng'], (float) $from['lat']],
                        [(float) $to['lng'], (float) $to['lat']],
                    ],
                    'radiuses' => [350, 350],
                ],
            ]);

            $status = $response->getStatusCode();
            $payload = $response->toArray(false);
        } catch (\Throwable $e) {
            return $this->json([
                'ok' => false,
                'error' => 'Routing API error: ' . $e->getMessage(),
            ], 502);
        }

        if ($status >= 400) {
            $orsMessage = $payload['error']['message'] ?? $payload['message'] ?? 'Routing API error';

            return $this->json([
                'ok' => false,
                'error' => 'ORS: ' . $orsMessage,
                'debug' => [
                    'from' => $from,
                    'to' => $to,
                ],
            ], 502);
        }

        if (!isset($payload['features'][0])) {
            return $this->json([
                'ok' => false,
                'error' => 'Route not found. Try addresses in a city center or click directly on roads.',
                'debug' => [
                    'from' => $from,
                    'to' => $to,
                ],
            ], 404);
        }

        $feature = $payload['features'][0];
        $summary = $feature['properties']['summary'] ?? [];
        $distanceMeters = (float) ($summary['distance'] ?? 0);
        $durationSec = (float) ($summary['duration'] ?? 0);

        $coords = $feature['geometry']['coordinates'] ?? [];
        $polyline = [];

        foreach ($coords as $c) {
            if (is_array($c) && count($c) >= 2) {
                $polyline[] = [(float) $c[1], (float) $c[0]];
            }
        }

        return $this->json([
            'ok' => true,
            'distance_m' => round($distanceMeters, 2),
            'distance_km' => round($distanceMeters / 1000, 2),
            'duration_min' => round($durationSec / 60, 1),
            'geometry' => $polyline,
        ]);
    }
}