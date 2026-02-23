<?php

namespace App\Entity;

use App\Repository\TripRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: TripRepository::class)]
#[ORM\Table(name: 'trips')]
class Trip
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class, inversedBy: 'trips')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\Column(length: 255)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 255)]
    private string $title = '';

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $distanceKm = 0;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $fuelPrice = 0;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $fuelConsumptionPer100 = 0;

    #[ORM\Column(type: 'integer')]
    #[Assert\Positive]
    private int $peopleCount = 1;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $routeCost = 0;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $lodgingCost = 0;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $foodCost = 0;

    #[ORM\Column(type: 'float')]
    #[Assert\PositiveOrZero]
    private float $otherCost = 0;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $startDate = null;

    #[ORM\Column(type: 'date', nullable: true)]
    private ?\DateTimeInterface $endDate = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\OneToMany(mappedBy: 'trip', targetEntity: TripExpense::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $expenses;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->expenses = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }

    public function getUser(): ?User { return $this->user; }
    public function setUser(?User $user): self { $this->user = $user; return $this; }

    public function getTitle(): string { return $this->title; }
    public function setTitle(string $title): self { $this->title = trim($title); return $this; }

    public function getDistanceKm(): float { return $this->distanceKm; }
    public function setDistanceKm(float $distanceKm): self { $this->distanceKm = max(0, $distanceKm); return $this; }

    public function getFuelPrice(): float { return $this->fuelPrice; }
    public function setFuelPrice(float $fuelPrice): self { $this->fuelPrice = max(0, $fuelPrice); return $this; }

    public function getFuelConsumptionPer100(): float { return $this->fuelConsumptionPer100; }
    public function setFuelConsumptionPer100(float $fuelConsumptionPer100): self { $this->fuelConsumptionPer100 = max(0, $fuelConsumptionPer100); return $this; }

    public function getPeopleCount(): int { return $this->peopleCount; }
    public function setPeopleCount(int $peopleCount): self { $this->peopleCount = max(1, $peopleCount); return $this; }

    public function getRouteCost(): float { return $this->routeCost; }
    public function setRouteCost(float $routeCost): self { $this->routeCost = max(0, $routeCost); return $this; }

    public function getLodgingCost(): float { return $this->lodgingCost; }
    public function setLodgingCost(float $lodgingCost): self { $this->lodgingCost = max(0, $lodgingCost); return $this; }

    public function getFoodCost(): float { return $this->foodCost; }
    public function setFoodCost(float $foodCost): self { $this->foodCost = max(0, $foodCost); return $this; }

    public function getOtherCost(): float { return $this->otherCost; }
    public function setOtherCost(float $otherCost): self { $this->otherCost = max(0, $otherCost); return $this; }

    public function getStartDate(): ?\DateTimeInterface { return $this->startDate; }
    public function setStartDate(?\DateTimeInterface $startDate): self { $this->startDate = $startDate; return $this; }

    public function getEndDate(): ?\DateTimeInterface { return $this->endDate; }
    public function setEndDate(?\DateTimeInterface $endDate): self { $this->endDate = $endDate; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function getExpenses(): Collection { return $this->expenses; }

    public function addExpense(TripExpense $expense): self
    {
        if (!$this->expenses->contains($expense)) {
            $this->expenses->add($expense);
            $expense->setTrip($this);
        }
        return $this;
    }

    public function removeExpense(TripExpense $expense): self
    {
        if ($this->expenses->removeElement($expense)) {
            if ($expense->getTrip() === $this) {
                $expense->setTrip(null);
            }
        }
        return $this;
    }
}