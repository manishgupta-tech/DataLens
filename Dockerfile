
# Stage 1: Build the Java application
FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml .
COPY src ./src

RUN mvn clean package -DskipTests

# Stage 2: Run the application using Tomcat
FROM tomcat:10.1-jdk17-temurin

# Remove default Tomcat applications
RUN rm -rf /usr/local/tomcat/webapps/*

# Copy the generated WAR file
COPY --from=build /app/target/*.war /usr/local/tomcat/webapps/ROOT.war

# Copy startup script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

CMD ["/usr/local/bin/docker-entrypoint.sh"]
