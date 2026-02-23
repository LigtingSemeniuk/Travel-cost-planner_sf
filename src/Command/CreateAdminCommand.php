<?php


namespace App\Command;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand(name: 'app:create-admin')]
class CreateAdminCommand extends Command
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $hasher
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $repo = $this->em->getRepository(User::class);
        $exists = $repo->findOneBy(['email' => 'admin@example.com']);
        if ($exists) {
            $output->writeln('Admin already exists.');
            return Command::SUCCESS;
        }

        $user = (new User())
            ->setEmail('admin@example.com')
            ->setRoles(['ROLE_ADMIN']);

        $user->setPassword($this->hasher->hashPassword($user, 'admin123'));

        $this->em->persist($user);
        $this->em->flush();

        $output->writeln('Admin created: admin@example.com / admin123');
        return Command::SUCCESS;
    }
}