<?php

namespace App\Entity;

use App\Repository\TripExpenseRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: TripExpenseRepository::class)]
#[ORM\Table(name: 'trip_expenses')]
class TripExpense
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Trip::class, inversedBy: 'expenses')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Trip $trip = null;

    #[ORM\Column(length: 50)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 50)]
    private string $category = 'other';

    #[ORM\Column(length: 255, nullable: true)]
    #[Assert\Length(max: 255)]
    private ?string $description = null;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $amount = 0;

    public function getId(): ?int { return $this->id; }

    public function getTrip(): ?Trip { return $this->trip; }
    public function setTrip(?Trip $trip): self { $this->trip = $trip; return $this; }

    public function getCategory(): string { return $this->category; }
    public function setCategory(string $category): self { $this->category = trim($category) ?: 'other'; return $this; }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $description): self { $this->description = $description !== null ? trim($description) : null; return $this; }

    public function getAmount(): float { return $this->amount; }
    public function setAmount(float $amount): self { $this->amount = max(0, $amount); return $this; }
}